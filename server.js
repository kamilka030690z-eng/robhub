const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = 3000;
const SECRET_KEY = 'robhub_super_secret_key_123';

app.use(cors());
app.use(express.json());

const db = new sqlite3.Database('./database.db', (err) => {
    if (err) console.error(err.message);
    else console.log('📦 Подключено к базе данных SQLite.');
});

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password TEXT, avatar TEXT, status TEXT, bio TEXT)`);
    db.run(`ALTER TABLE users ADD COLUMN banner TEXT`, () => {});
    db.run(`ALTER TABLE users ADD COLUMN frame TEXT`, () => {});
    db.run(`ALTER TABLE users ADD COLUMN isPremium INTEGER DEFAULT 0`, () => {});
    db.run(`ALTER TABLE users ADD COLUMN lastSeen TEXT`, () => {});
    db.run(`ALTER TABLE users ADD COLUMN hideOnline INTEGER DEFAULT 0`, () => {});

    db.run(`CREATE TABLE IF NOT EXISTS posts (id INTEGER PRIMARY KEY AUTOINCREMENT, author TEXT, caption TEXT, image TEXT, likes INTEGER DEFAULT 0, date TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, sender TEXT, receiver TEXT, text TEXT, time TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS comments (id INTEGER PRIMARY KEY AUTOINCREMENT, post_id INTEGER, author TEXT, text TEXT, time TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS likes (post_id INTEGER, username TEXT, UNIQUE(post_id, username))`);
    db.run(`CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, recipient TEXT, sender TEXT, type TEXT, post_id INTEGER, text TEXT, is_read INTEGER DEFAULT 0, time TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS comment_likes (comment_id INTEGER, username TEXT, UNIQUE(comment_id, username))`);
    
    // ТАБЛИЦА ДРУЗЕЙ С НОВЫМ СТАТУСОМ
    db.run(`CREATE TABLE IF NOT EXISTS friendships (user1 TEXT, user2 TEXT, hiddenBy TEXT, status TEXT DEFAULT 'pending', UNIQUE(user1, user2))`);
    db.run(`ALTER TABLE friendships ADD COLUMN status TEXT DEFAULT 'pending'`, () => {});

    db.run(`CREATE TABLE IF NOT EXISTS subscriptions (subscriber TEXT, target TEXT, UNIQUE(subscriber, target))`);
    db.run(`CREATE TABLE IF NOT EXISTS wall_posts (id INTEGER PRIMARY KEY AUTOINCREMENT, owner TEXT, author TEXT, text TEXT, time TEXT)`);
});

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Нет доступа' });
    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.status(403).json({ error: 'Неверный токен' });
        req.user = user;
        next();
    });
}

app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Please enter login and password!' });
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const defaultAvatar = "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="120" height="120" fill="#CCDDEE"/><circle cx="60" cy="45" r="22" fill="#6688AA"/><rect x="30" y="75" width="60" height="40" fill="#6688AA"/></svg>');
        
        db.run(`INSERT INTO users (username, password, avatar, status, bio, lastSeen) VALUES (?, ?, ?, ?, ?, ?)`, 
        [username, hashedPassword, defaultAvatar, 'Hello, I am using RobHub!', '', new Date().toISOString()], 
        function(err) {
            if (err) return res.status(400).json({ error: 'This username is already taken!' });
            
            // Отправляем приветственное сообщение от RobHub
            const welcomeText = `Welcome to RobHub, thanks for joining our site! You registered: ${new Date().toLocaleString()}. Welcome!`;
            db.run(`INSERT INTO messages (sender, receiver, text, time) VALUES (?, ?, ?, ?)`, 
            ['RobHub', username, welcomeText, new Date().toLocaleTimeString()]);

            res.json({ message: 'Account created!' });
        });
    } catch (error) { res.status(500).json({ error: 'Server error!' }); }
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.get(`SELECT * FROM users WHERE username = ?`, [username], async (err, user) => {
        if (err || !user) return res.status(400).json({ error: 'Неверный логин или пароль' });
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) return res.status(400).json({ error: 'Неверный логин или пароль' });
        db.run(`UPDATE users SET lastSeen = ? WHERE username = ?`, [new Date().toISOString(), username]);
        const token = jwt.sign({ username: user.username }, SECRET_KEY);
        res.json({ token, username: user.username, avatar: user.avatar, status: user.status, bio: user.bio, isPremium: user.isPremium, banner: user.banner, frame: user.frame, hideOnline: user.hideOnline });
    });
});

app.get('/api/posts', (req, res) => {
    db.all(`SELECT * FROM posts ORDER BY id DESC`, [], (err, posts) => {
        if (err) return res.status(500).json({ error: err.message });
        let processedPosts = []; let remaining = posts.length;
        if (remaining === 0) return res.json([]);
        posts.forEach(post => {
            db.get(`SELECT avatar FROM users WHERE username = ?`, [post.author], (err, userRow) => {
                post.avatar = userRow ? userRow.avatar : '';
                db.all(`SELECT username FROM likes WHERE post_id = ?`, [post.id], (err, likes) => {
                    post.likedBy = likes.map(l => l.username);
                    db.all(`SELECT * FROM comments WHERE post_id = ? ORDER BY id ASC`, [post.id], (err, comments) => {
                        post.comments = comments;
                        if (comments.length === 0) {
                            processedPosts.push(post); remaining--;
                            if (remaining === 0) return res.json(processedPosts.sort((a, b) => b.id - a.id));
                            return;
                        }
                        let cProcessed = 0;
                        comments.forEach(c => {
                            db.all(`SELECT username FROM comment_likes WHERE comment_id = ?`, [c.id], (err, cLikes) => {
                                c.likedBy = cLikes.map(l => l.username);
                                cProcessed++;
                                if (cProcessed === comments.length) {
                                    processedPosts.push(post); remaining--;
                                    if (remaining === 0) res.json(processedPosts.sort((a, b) => b.id - a.id));
                                }
                            });
                        });
                    });
                });
            });
        });
    });
});

app.post('/api/posts', authenticateToken, (req, res) => {
    db.run(`INSERT INTO posts (author, caption, image, date) VALUES (?, ?, ?, ?)`, [req.user.username, req.body.caption, req.body.image, new Date().toLocaleString()], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Пост создан!', id: this.lastID });
    });
});

app.post('/api/posts/:id/like', authenticateToken, (req, res) => {
    db.get(`SELECT * FROM likes WHERE post_id = ? AND username = ?`, [req.params.id, req.user.username], (err, row) => {
        if (row) db.run(`DELETE FROM likes WHERE post_id = ? AND username = ?`, [req.params.id, req.user.username]);
        else {
            db.run(`INSERT INTO likes (post_id, username) VALUES (?, ?)`, [req.params.id, req.user.username]);
            db.get(`SELECT author FROM posts WHERE id = ?`, [req.params.id], (err, post) => {
                if (post && post.author !== req.user.username) {
                    db.run(`INSERT INTO notifications (recipient, sender, type, post_id, text, time) VALUES (?, ?, ?, ?, ?, ?)`, [post.author, req.user.username, 'like', req.params.id, `поставил(а) лайк на ваш пост`, new Date().toLocaleString()]);
                }
            });
        }
        res.json({ success: true });
    });
});

app.post('/api/posts/:id/comment', authenticateToken, (req, res) => {
    db.run(`INSERT INTO comments (post_id, author, text, time) VALUES (?, ?, ?, ?)`, [req.params.id, req.user.username, req.body.text, new Date().toLocaleTimeString()], function(err) { res.json({ success: true }); });
});

app.delete('/api/posts/:id', authenticateToken, (req, res) => {
    db.run(`DELETE FROM posts WHERE id = ? AND author = ?`, [req.params.id, req.user.username], function(err) {
        db.run(`DELETE FROM likes WHERE post_id = ?`, [req.params.id]); db.run(`DELETE FROM comments WHERE post_id = ?`, [req.params.id]);
        res.json({ success: true });
    });
});

app.get('/api/search', (req, res) => {
    db.all(`SELECT username, avatar, status, isPremium FROM users WHERE username LIKE ? LIMIT 10`, [`${req.query.q}%`], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// ПРОФИЛЬ (С ПРАВИЛЬНЫМ СТАТУСОМ ДРУЖБЫ)
app.get('/api/user/:username', authenticateToken, (req, res) => {
    const target = req.params.username;
    db.get(`SELECT username, avatar, status, bio, banner, frame, isPremium, lastSeen, hideOnline FROM users WHERE username = ?`, [target], (err, user) => {
        if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
        db.all(`SELECT COUNT(*) as posts FROM posts WHERE author = ?`, [target], (err, p) => {
            user.postsCount = p[0].posts;
            db.all(`SELECT COUNT(*) as subs FROM subscriptions WHERE target = ?`, [target], (err, s) => {
                user.subscribers = s[0].subs;
                db.get(`SELECT * FROM subscriptions WHERE subscriber = ? AND target = ?`, [req.user.username, target], (err, subRow) => {
                    user.isSubscribed = !!subRow;
                    
                    // Проверяем статус дружбы
                    db.get(`SELECT * FROM friendships WHERE (user1 = ? AND user2 = ?) OR (user1 = ? AND user2 = ?)`, [req.user.username, target, target, req.user.username], (err, fRow) => {
                        let friendStatus = 'none';
                        if (fRow) {
                            if (fRow.status === 'accepted') friendStatus = 'friends';
                            else if (fRow.status === 'pending' && fRow.user1 === req.user.username) friendStatus = 'sent';
                            else if (fRow.status === 'pending' && fRow.user2 === req.user.username) friendStatus = 'incoming';
                        }
                        user.friendStatus = friendStatus;

                        // Получаем список друзей
                        db.all(`SELECT user1, user2 FROM friendships WHERE (user1 = ? OR user2 = ?) AND status = 'accepted'`, [target, target], (err, friends) => {
                            user.friends = friends.map(f => f.user1 === target ? f.user2 : f.user1);
                            
                            db.all(`SELECT * FROM wall_posts WHERE owner = ? ORDER BY id DESC`, [target], (err, wall) => {
                                user.wall = wall;
                                res.json(user);
                            });
                        });
                    });
                });
            });
        });
    });
});

app.post('/api/user/update', authenticateToken, (req, res) => {
    const { banner, frame, hideOnline, bio, status } = req.body;
    db.run(`UPDATE users SET banner = COALESCE(?, banner), frame = COALESCE(?, frame), hideOnline = COALESCE(?, hideOnline), bio = COALESCE(?, bio), status = COALESCE(?, status) WHERE username = ?`, 
    [banner, frame, hideOnline, bio, status, req.user.username], function(err) { res.json({ success: true }); });
});

app.post('/api/profile', authenticateToken, (req, res) => {
    db.run(`UPDATE users SET status = ?, avatar = ? WHERE username = ?`, [req.body.status, req.body.avatar, req.user.username], function(err) { res.json({ success: true }); });
});

// СИСТЕМА ЗАЯВОК
app.post('/api/friends/request', authenticateToken, (req, res) => {
    const me = req.user.username;
    const target = req.body.target;
    if (me === target) return res.status(400).json({ error: 'Нельзя добавить себя!' });

    db.get(`SELECT * FROM friendships WHERE (user1 = ? AND user2 = ?) OR (user1 = ? AND user2 = ?)`, [me, target, target, me], (err, row) => {
        if (row) return res.status(400).json({ error: 'Заявка уже отправлена или вы уже друзья' });
        db.run(`INSERT INTO friendships (user1, user2, status) VALUES (?, ?, 'pending')`, [me, target], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            db.run(`INSERT INTO notifications (recipient, sender, type, text, time) VALUES (?, ?, ?, ?, ?)`, [target, me, 'friend_request', 'хочет добавить вас в друзья', new Date().toLocaleString()]);
            res.json({ success: true });
        });
    });
});

app.post('/api/friends/accept', authenticateToken, (req, res) => {
    const me = req.user.username;
    const target = req.body.target;

    db.run(`UPDATE friendships SET status = 'accepted' WHERE user1 = ? AND user2 = ? AND status = 'pending'`, [target, me], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        db.run(`INSERT INTO notifications (recipient, sender, type, text, time) VALUES (?, ?, ?, ?, ?)`, [target, me, 'friend_accept', 'принял(а) вашу заявку в друзья', new Date().toLocaleString()]);
        res.json({ success: true });
    });
});

app.post('/api/friends/decline', authenticateToken, (req, res) => {
    const me = req.user.username;
    const target = req.body.target;
    db.run(`DELETE FROM friendships WHERE user1 = ? AND user2 = ? AND status = 'pending'`, [target, me], function(err) {
        res.json({ success: true });
    });
});

app.post('/api/user/subscribe', authenticateToken, (req, res) => {
    db.get(`SELECT * FROM subscriptions WHERE subscriber = ? AND target = ?`, [req.user.username, req.body.target], (err, row) => {
        if (row) db.run(`DELETE FROM subscriptions WHERE subscriber = ? AND target = ?`, [req.user.username, req.body.target]);
        else db.run(`INSERT INTO subscriptions (subscriber, target) VALUES (?, ?)`, [req.user.username, req.body.target]);
        res.json({ success: true });
    });
});

app.post('/api/wall', authenticateToken, (req, res) => {
    db.run(`INSERT INTO wall_posts (owner, author, text, time) VALUES (?, ?, ?, ?)`, [req.body.owner, req.user.username, req.body.text, new Date().toLocaleString()], function(err) { res.json({ success: true }); });
});

app.post('/api/messages', authenticateToken, (req, res) => {
    db.run(`INSERT INTO messages (sender, receiver, text, time) VALUES (?, ?, ?, ?)`, [req.user.username, req.body.receiver, req.body.text, new Date().toLocaleTimeString()], function(err) { res.json({ success: true }); });
});

app.get('/api/messages/:target', authenticateToken, (req, res) => {
    db.all(`SELECT * FROM messages WHERE (sender = ? AND receiver = ?) OR (sender = ? AND receiver = ?) ORDER BY id ASC`, [req.user.username, req.params.target, req.params.target, req.user.username], (err, rows) => { res.json(rows); });
});

app.get('/api/contacts', authenticateToken, (req, res) => {
    db.all(`SELECT DISTINCT CASE WHEN sender = ? THEN receiver ELSE sender END as contact FROM messages WHERE sender = ? OR receiver = ?`, [req.user.username, req.user.username, req.user.username], (err, rows) => { res.json(rows.map(r => r.contact)); });
});

app.get('/api/notifications', authenticateToken, (req, res) => {
    db.all(`SELECT * FROM notifications WHERE recipient = ? ORDER BY id DESC LIMIT 20`, [req.user.username], (err, rows) => { res.json(rows); });
});

app.post('/api/notifications/read', authenticateToken, (req, res) => {
    db.run(`UPDATE notifications SET is_read = 1 WHERE recipient = ?`, [req.user.username], function(err) { res.json({ success: true }); });
});

app.post('/api/comments/:id/like', authenticateToken, (req, res) => {
    db.get(`SELECT * FROM comment_likes WHERE comment_id = ? AND username = ?`, [req.params.id, req.user.username], (err, row) => {
        if (row) db.run(`DELETE FROM comment_likes WHERE comment_id = ? AND username = ?`, [req.params.id, req.user.username]);
        else db.run(`INSERT INTO comment_likes (comment_id, username) VALUES (?, ?)`, [req.params.id, req.user.username]);
        res.json({ success: true });
    });
});

app.post('/api/make-premium', authenticateToken, (req, res) => {
    if (req.user.username !== 'kamilka301114' && req.user.username !== 'kamil') return res.status(403).json({ error: 'Только создатель!' });
    db.run(`UPDATE users SET isPremium = 1 WHERE username = ?`, [req.body.targetUser], function(err) { res.json({ success: true }); });
});

app.get('/api/premium-users', (req, res) => {
    db.all(`SELECT username FROM users WHERE isPremium = 1`, [], (err, rows) => { res.json(rows.map(r => r.username)); });
});

app.listen(PORT, () => { console.log(`🚀 Сервер RobHub запущен на http://localhost:${PORT}`); });