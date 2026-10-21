const API_URL = 'http://localhost:3000/api';
let currentUser = null;
let currentToken = localStorage.getItem('token');
let currentAvatar = localStorage.getItem('avatar');

const DEFAULT_AVATAR = "data:image/svg+xml;utf8," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="120" height="120" fill="#CCDDEE"/><circle cx="60" cy="45" r="22" fill="#6688AA"/><rect x="30" y="75" width="60" height="40" fill="#6688AA"/></svg>'
);

async function login() {
    const username = document.getElementById('usernameInput').value.trim();
    const password = document.getElementById('passwordInput').value.trim();
    if (!username || !password) return alert("Please enter username and password!");
    try {
        const res = await fetch(`${API_URL}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
        const data = await res.json();
        if (data.error) return alert(data.error);
        localStorage.setItem('token', data.token);
        localStorage.setItem('username', data.username);
        localStorage.setItem('avatar', data.avatar);
        localStorage.setItem('status', data.status);
        localStorage.setItem('isPremium', data.isPremium);
        currentToken = data.token;
        currentUser = data.username;
        currentAvatar = data.avatar;
        updateUIAfterLogin();
        switchTab('feedTab');
    } catch (err) { alert("Server is offline!"); }
}

async function register() {
    const username = document.getElementById('usernameInput').value.trim();
    const password = document.getElementById('passwordInput').value.trim();
    if (!username || !password) return alert("Please enter username and password!");
    try {
        const res = await fetch(`${API_URL}/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
        const data = await res.json();
        if (data.error) return alert(data.error);
        alert("Account created! Please log in.");
    } catch (err) { alert("Server is offline!"); }
}

function logout() {
    currentUser = null; currentToken = null; currentAvatar = null;
    localStorage.clear();
    document.getElementById('authBox').style.display = 'block';
    document.getElementById('avatarBox').style.display = 'none';
    document.getElementById('uploadBtn').style.display = 'none';
    document.getElementById('userPanel').innerHTML = 'Guest | Please log in';
    document.getElementById('notificationBell').style.display = 'none';
    switchTab('feedTab');
}

function updateUIAfterLogin() {
    document.getElementById('authBox').style.display = 'none';
    document.getElementById('avatarBox').style.display = 'block';
    document.getElementById('uploadBtn').style.display = 'block';
    document.getElementById('userPanel').innerHTML = `Hello, <strong>${currentUser}</strong>!`;
    document.getElementById('userProfileName').innerText = currentUser;
    document.getElementById('myAvatarImg').src = currentAvatar || DEFAULT_AVATAR;
    let savedStatus = localStorage.getItem('status');
    document.getElementById('myStatusText').innerText = `"${savedStatus ? savedStatus : 'Hello, I am using RobHub!'}"`;
    document.getElementById('statusChangeInput').value = savedStatus || '';
    updateNotifications();
    if (currentUser === 'kamilka301114' || currentUser === 'kamil') {
        const adminBox = document.getElementById('premiumAdminBox');
        if(adminBox) adminBox.style.display = 'block';
    }
}

function toggleAvatarInput() {
    let source = document.getElementById('avatarSourceSelect').value;
    document.getElementById('avatarUrlInput').style.display = source === 'url' ? 'inline-block' : 'none';
    document.getElementById('avatarFileInput').style.display = source === 'file' ? 'inline-block' : 'none';
}

async function saveProfileSettings() {
    if (!currentUser) return;
    const status = document.getElementById('statusChangeInput').value.trim();
    const source = document.getElementById('avatarSourceSelect').value;
    const banner = document.getElementById('bannerUrlInput').value.trim();
    const frame = document.getElementById('frameSelect').value;
    const hideOnline = document.getElementById('hideOnlineCheckbox').checked ? 1 : 0;
    let newAvatar = currentAvatar;
    if (source === 'url') {
        let url = document.getElementById('avatarUrlInput').value.trim();
        if (url) newAvatar = url;
    } else {
        let fileInput = document.getElementById('avatarFileInput');
        if (fileInput.files && fileInput.files[0]) {
            newAvatar = await new Promise((resolve) => {
                let reader = new FileReader();
                reader.onload = (e) => resolve(e.target.result);
                reader.readAsDataURL(fileInput.files[0]);
            });
        }
    }
    try {
        await fetch(`${API_URL}/profile`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentToken}` }, body: JSON.stringify({ status, avatar: newAvatar }) });
        await fetch(`${API_URL}/user/update`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentToken}` }, body: JSON.stringify({ banner, frame, hideOnline, status }) });
        localStorage.setItem('status', status);
        localStorage.setItem('avatar', newAvatar);
        currentAvatar = newAvatar;
        updateUIAfterLogin();
        alert("Profile saved!");
    } catch (err) { alert("Error saving profile"); }
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.style.display = 'none');
    document.getElementById(tabId).style.display = 'block';
    if (tabId === 'feedTab') renderPosts();
    if (tabId === 'messagesTab') { renderContacts(); renderMessages(); }
}

async function searchUsers() {
    const query = document.getElementById('searchInput').value.trim();
    const container = document.getElementById('searchResults');
    if (query.length < 1) { container.innerHTML = ''; return; }
    try {
        const res = await fetch(`${API_URL}/search?q=${query}`);
        const users = await res.json();
        if (users.length === 0) { container.innerHTML = '<div style="color:#777;">No users found.</div>'; return; }
        container.innerHTML = users.map(u => `
            <div class="user-search-item" style="display:flex; align-items:center; gap:10px; padding:10px; border-bottom:1px solid #eee;">
                <img src="${u.avatar || DEFAULT_AVATAR}" style="width:40px; height:40px; border-radius:50%; object-fit:cover;">
                <div>
                    <div class="post-username" style="cursor:pointer; font-size:14px;" onclick="openProfile('${u.username}')">${u.username} ${u.isPremium ? '👑' : ''}</div>
                    <div style="font-size:11px; color:#777;">${u.status || 'No status'}</div>
                </div>
                <button class="auth-btn" style="margin-left:auto;" onclick="openProfile('${u.username}')">View Profile</button>
            </div>
        `).join('');
    } catch(e) { container.innerHTML = 'Search error.'; }
}

function openMyProfile() {
    if (!currentUser) return alert("Please log in!");
    openProfile(currentUser);
}

async function openProfile(username) {
    switchTab('profileTab');
    const content = document.getElementById('profileContent');
    content.innerHTML = 'Loading...';
    try {
        const res = await fetch(`${API_URL}/user/${username}`, { headers: { 'Authorization': `Bearer ${currentToken}` } });
        const user = await res.json();
        if (user.error) return content.innerHTML = `<h2>${user.error}</h2>`;
        let timeStr = 'Recently';
        if (!user.hideOnline && user.lastSeen) {
            const diff = Math.floor((new Date() - new Date(user.lastSeen)) / 60000);
            timeStr = diff < 5 ? 'Online' : `Last seen ${diff} min ago`;
        }
        let frameClass = user.frame === 'simple' ? 'frame-simple' : user.frame === 'gradient' ? 'frame-gradient' : '';
        let bannerStyle = user.banner ? `background-image: url('${user.banner}');` : '';
        let friendsHtml = user.friends.slice(0, 9).map(f => `<div class="friend-mini" onclick="openProfile('${f}')"><img src="${DEFAULT_AVATAR}"><div style="font-size:10px;">${f}</div></div>`).join('');
        
        content.innerHTML = `
            <div class="profile-header">
                <div class="profile-banner" style="${bannerStyle}"></div>
                <div class="profile-main-info">
                    <div class="profile-avatar-container"><img class="profile-avatar ${frameClass}" src="${user.avatar || DEFAULT_AVATAR}"></div>
                    <div>
                        <div class="profile-username ${user.isPremium ? 'premium-username' : ''}">${user.username} ${user.isPremium ? '👑' : ''}</div>
                        <div style="font-size:12px; color:#666;">${timeStr}</div>
                        <div class="profile-stats"><div><b>${user.postsCount}</b> Posts</div><div><b>${user.subscribers}</b> Subs</div></div>
                    </div>
                    <div class="profile-actions">
                        ${currentUser !== username ? `
                            <button class="auth-btn" onclick="toggleSub('${username}')">${user.isSubscribed ? 'Unsubscribe' : 'Subscribe'}</button>
                            <button class="auth-btn" onclick="openDMWith('${username}')">Message</button>
                            
                            ${user.friendStatus === 'friends' ? `<button class="auth-btn" style="background:#DDD;" disabled>✓ Friends</button>` : 
                              user.friendStatus === 'sent' ? `<button class="auth-btn" style="background:#DDD;" disabled>Request Sent</button>` :
                              user.friendStatus === 'incoming' ? `<button class="auth-btn" onclick="acceptFriend('${username}')" style="background:#00CC00; color:white;">Accept Friend</button>` :
                              `<button class="auth-btn" onclick="sendFriendRequest('${username}')">Add Friend</button>`}
                        ` : `<button class="auth-btn" onclick="switchTab('settingsTab')">Edit Profile</button>`}
                    </div>
                </div>
            </div>
            <div class="profile-body">
                <div class="profile-side">
                    <div class="profile-side-section"><b style="font-size:12px;">Friends (${user.friends.length})</b><div class="friends-grid">${friendsHtml}</div></div>
                    <div class="profile-side-section"><b style="font-size:12px;">Info</b><div style="font-size:12px; margin-top:5px; color:#555;">${user.bio || 'No bio yet.'}</div></div>
                </div>
                <div class="profile-main">
                    <h3 style="font-size:16px; margin-bottom:10px;">Wall</h3>
                    ${currentUser === username || user.friends.includes(currentUser) ? `<div class="wall-input-box"><input type="text" id="wallInput" placeholder="Write on wall..." style="flex:1; padding:5px;"><button class="auth-btn" onclick="postToWall('${username}')">Post</button></div>` : ''}
                    ${user.wall.map(w => `<div class="wall-post"><div style="font-size:11px; color:#777; margin-bottom:5px;"><b style="color:#003399; cursor:pointer;" onclick="openProfile('${w.author}')">${w.author}</b> • ${w.time}</div><div style="font-size:13px;">${escapeHtml(w.text)}</div></div>`).join('')}
                    ${user.wall.length === 0 ? '<div style="font-size:12px; color:#777;">Wall is empty.</div>' : ''}
                </div>
            </div>
        `;
    } catch(e) { content.innerHTML = 'Error loading profile'; }
}

async function sendFriendRequest(target) {
    const res = await fetch(`${API_URL}/friends/request`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentToken}` }, body: JSON.stringify({ target }) });
    const data = await res.json();
    if (data.error) alert(data.error);
    openProfile(target);
}

async function acceptFriend(target) {
    await fetch(`${API_URL}/friends/accept`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentToken}` }, body: JSON.stringify({ target }) });
    openProfile(target);
}

async function declineFriend(target) {
    await fetch(`${API_URL}/friends/decline`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentToken}` }, body: JSON.stringify({ target }) });
    updateNotifications();
    if (document.getElementById('profileTab').style.display === 'block') openProfile(target);
}

async function toggleSub(target) { await fetch(`${API_URL}/user/subscribe`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentToken}` }, body: JSON.stringify({ target }) }); openProfile(target); }
async function postToWall(owner) {
    const text = document.getElementById('wallInput').value.trim();
    if (!text) return;
    await fetch(`${API_URL}/wall`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentToken}` }, body: JSON.stringify({ owner, text }) });
    openProfile(owner);
}

async function renderPosts() {
    const container = document.getElementById('newsFeed');
    container.innerHTML = 'Loading...';
    let premiumUsers = [];
    try { const pRes = await fetch(`${API_URL}/premium-users`); premiumUsers = await pRes.json(); } catch(e) {}

    try {
        const res = await fetch(`${API_URL}/posts`);
        const posts = await res.json();
        if (posts.length === 0) container.innerHTML = '<div class="no-posts">No posts yet.</div>';
        else container.innerHTML = '';

        posts.forEach(post => {
            const isMine = currentUser === post.author;
            const liked = post.likedBy && post.likedBy.includes(currentUser);
            const comments = post.comments || [];
            const isPremium = premiumUsers.includes(post.author);

            let commentsHtml = comments.map(c => {
                const likedC = c.likedBy && c.likedBy.includes(currentUser);
                return `<div class="comment" style="display:flex; justify-content:space-between;">
                    <div><b class="post-username" style="cursor:pointer;" onclick="openProfile('${escapeHtml(c.author)}')">${escapeHtml(c.author)}</b> [${c.time}]<br>${escapeHtml(c.text)}</div>
                    <button onclick="likeComment(${c.id})" style="background:none; border:none; color:${likedC ? '#003399' : '#777'}">${likedC ? '💙' : '👍'} ${c.likedBy?.length || ''}</button>
                </div>`;
            }).join('');

            const div = document.createElement('div');
            div.className = 'post';
            div.innerHTML = `
                <div class="post-user-info">
                    <img src="${post.avatar || DEFAULT_AVATAR}" style="cursor:pointer;" onclick="openProfile('${escapeHtml(post.author)}')">
                    <div><span class="post-username ${isPremium ? 'premium-username' : ''}" onclick="openProfile('${escapeHtml(post.author)}')">${escapeHtml(post.author)}</span>${isPremium ? '<span class="premium-badge">👑</span>' : ''}</div>
                </div>
                <div class="post-content">
                    <div class="post-meta"><span>Posted: ${post.date}</span>${isMine ? `<button class="btn-delete" onclick="deletePost(${post.id})">Delete</button>` : ''}</div>
                    <div class="post-caption">${escapeHtml(post.caption)}</div>
                    ${post.image ? `<img class="post-image" src="${post.image}">` : ''}
                    <div class="like-section"><button onclick="likePost(${post.id})">${liked ? '💔' : '👍'} Like</button><span>Likes: <b>${post.likedBy.length}</b></span></div>
                    <div class="comments-section"><b style="font-size:11px;">Comments (${comments.length}):</b>${commentsHtml}<div class="comment-input-row"><input type="text" id="commentInput_${post.id}" onkeydown="if(event.key==='Enter')addComment(${post.id})" placeholder="Write a comment..."><button onclick="addComment(${post.id})">Send</button></div></div>
                </div>
            `;
            container.appendChild(div);
        });
    } catch (err) { container.innerHTML = '<div class="no-posts">Error loading posts.</div>'; }
}

async function submitNewPost() {
    if (!currentUser) return alert("Please log in!");
    const text = document.getElementById('postCaptionInput').value.trim();
    const image = document.getElementById('postImageUrlInput').value.trim();
    if (!text && !image) return alert("Add text or image!");
    await fetch(`${API_URL}/posts`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentToken}` }, body: JSON.stringify({ caption: text, image }) });
    closeModal(); renderPosts();
}

async function likePost(id) { await fetch(`${API_URL}/posts/${id}/like`, { method: 'POST', headers: { 'Authorization': `Bearer ${currentToken}` } }); renderPosts(); }
async function likeComment(id) { await fetch(`${API_URL}/comments/${id}/like`, { method: 'POST', headers: { 'Authorization': `Bearer ${currentToken}` } }); renderPosts(); }
async function addComment(postId) {
    const input = document.getElementById(`commentInput_${postId}`);
    if (!input.value.trim()) return;
    await fetch(`${API_URL}/posts/${postId}/comment`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentToken}` }, body: JSON.stringify({ text: input.value.trim() }) });
    renderPosts();
}
async function deletePost(id) { if(!confirm("Delete this post?")) return; await fetch(`${API_URL}/posts/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${currentToken}` } }); renderPosts(); }

async function renderContacts() {
    let container = document.getElementById('dmContactsList');
    const res = await fetch(`${API_URL}/contacts`, { headers: { 'Authorization': `Bearer ${currentToken}` } });
    const partners = await res.json();
    container.innerHTML = partners.length === 0 ? 'No chats yet' : partners.map(p => `<div class="dm-contact-item" onclick="document.getElementById('dmTargetInput').value='${p}'; renderMessages();">${p}</div>`).join('');
}

async function sendDirectMessage() {
    const target = document.getElementById('dmTargetInput').value.trim();
    const text = document.getElementById('dmTextInput').value.trim();
    if (!target || !text) return;
    await fetch(`${API_URL}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentToken}` }, body: JSON.stringify({ receiver: target, text }) });
    document.getElementById('dmTextInput').value = ''; renderMessages(); renderContacts();
}

async function renderMessages() {
    const target = document.getElementById('dmTargetInput').value.trim();
    const container = document.getElementById('dmHistory');
    if (!target) return container.innerHTML = 'Enter username.';
    const res = await fetch(`${API_URL}/messages/${target}`, { headers: { 'Authorization': `Bearer ${currentToken}` } });
    const messages = await res.json();
    if (messages.length === 0) return container.innerHTML = 'No messages yet. Say hi!';
    container.innerHTML = messages.map(m => `<div class="dm-message ${m.sender === currentUser ? 'sent' : 'received'}"><b>${m.sender}</b> [${m.time}]<br>${escapeHtml(m.text)}</div>`).join('');
    container.scrollTop = container.scrollHeight;
}

function openDMWith(username) { switchTab('messagesTab'); document.getElementById('dmTargetInput').value = username; renderContacts(); renderMessages(); }

async function updateNotifications() {
    if (!currentUser) return;
    document.getElementById('notificationBell').style.display = 'block';
    const res = await fetch(`${API_URL}/notifications`, { headers: { 'Authorization': `Bearer ${currentToken}` } });
    const notifs = await res.json();
    const unread = notifs.filter(n => n.is_read === 0).length;
    const badge = document.getElementById('notifBadge');
    if (unread > 0) { badge.innerText = unread > 9 ? '9+' : unread; badge.style.display = 'block'; } else badge.style.display = 'none';
    
    document.getElementById('notifList').innerHTML = notifs.map(n => {
        let actionBtns = '';
        if (n.type === 'friend_request' && n.is_read === 0) {
            actionBtns = `<div style="margin-top:5px;"><button onclick="acceptFriend('${n.sender}')" style="background:#00CC00; color:white; font-size:10px; padding:2px 5px;">Accept</button> <button onclick="declineFriend('${n.sender}')" style="background:#CC4444; color:white; font-size:10px; padding:2px 5px;">Decline</button></div>`;
        }
        return `<div style="padding:8px; font-size:12px; background:${n.is_read ? 'white' : '#F0F8FF'}; border-bottom:1px solid #eee;">
            <b>${n.sender}</b> ${n.text}<br><span style="font-size:10px;color:#999;">${n.time}</span>${actionBtns}
        </div>`;
    }).join('');
}

async function toggleNotifications() {
    const d = document.getElementById('notifDropdown');
    if (d.style.display === 'none') {
        d.style.display = 'block';
        await fetch(`${API_URL}/notifications/read`, { method: 'POST', headers: { 'Authorization': `Bearer ${currentToken}` } });
        document.getElementById('notifBadge').style.display = 'none';
    } else d.style.display = 'none';
}
document.addEventListener('click', e => { const b = document.getElementById('notificationBell'); if (b && !b.contains(e.target)) document.getElementById('notifDropdown').style.display = 'none'; });

function openModal() { document.getElementById('uploadModal').style.display = 'flex'; }
function closeModal() { document.getElementById('uploadModal').style.display = 'none'; }
function escapeHtml(str) { return str ? String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : ''; }

function changeTheme() {
    const theme = document.getElementById('themeSelect').value;
    document.body.className = theme; 
    localStorage.setItem('siteTheme', theme); 
}
const savedTheme = localStorage.getItem('siteTheme') || 'light';
document.body.className = savedTheme;
if(document.getElementById('themeSelect')) document.getElementById('themeSelect').value = savedTheme;

async function givePremium() {
    const target = document.getElementById('premiumTargetInput').value.trim();
    if (!target) return alert("Enter username!");
    const res = await fetch(`${API_URL}/make-premium`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentToken}` }, body: JSON.stringify({ targetUser: target }) });
    const data = await res.json();
    if (data.error) return alert(data.error);
    alert(`User ${target} is now Premium! 👑`);
    renderPosts();
}

if (currentToken && localStorage.getItem('username')) { currentUser = localStorage.getItem('username'); updateUIAfterLogin(); switchTab('feedTab'); }
setInterval(() => { if (currentUser) updateNotifications(); }, 10000);