// ====================================================================
// 🌟 RECHARGE SLABS & COIN CALCULATION LOGIC
// ====================================================================
function calculateCoinsWithMegaOffer(amount) {
    const baseRate = 30 / 9; 
    let rawCoins = Math.round(amount * baseRate);
    let bonusCoins = 0;

    if (amount >= 5000) bonusCoins = 6000;
    else if (amount >= 2000) bonusCoins = 2000;
    else if (amount >= 1500) bonusCoins = 1400;
    else if (amount >= 1000) bonusCoins = 900;
    else if (amount >= 750) bonusCoins = 650;
    else if (amount >= 500) bonusCoins = 350;
    else if (amount >= 300) bonusCoins = 180;
    else if (amount >= 200) bonusCoins = 110;
    else if (amount >= 149) bonusCoins = 75;
    else if (amount >= 100) bonusCoins = 45;
    else if (amount >= 50) bonusCoins = 20;

    let total = rawCoins + bonusCoins;
    if (amount >= 5000) total += Math.round(total * 0.10);
    return { totalCoins: total };
}

// ====================================================================
// SERVER CORE & DATABASE
// ====================================================================
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static('public'));

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/chitchat';
mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.log('❌ DB Error:', err));

const userSchema = new mongoose.Schema({
    name: { type: String, unique: true, required: true },
    coins: { type: Number, default: 1000 },
    role: { type: String, default: 'user' },
    vip: { type: Boolean, default: true },
    relationships: {
        cpPartner: { type: String, default: 'Single' },
        bestie: { type: String, default: 'None' },
        familySquad: { type: String, default: 'No Squad' },
        sweetheart: { type: String, default: 'Not Tagged' }
    }
});
const User = mongoose.model('User', userSchema);

let roomState = {
    membersCount: 1845,
    seats: Array(9).fill(null),
    announcement: "🔥 ChitChat Official Club: Niyamo ka palan karein aur enjoy karein!"
};

let privateChats = {};
function getChatKey(user1, user2) {
    return [user1, user2].sort().join('_');
}

io.on('connection', (socket) => {
    socket.emit('init_room', roomState);

    socket.on('join_room', async (userData) => {
        socket.data.user = userData;
        try {
            let dbUser = await User.findOne({ name: userData.name });
            if (!dbUser) {
                dbUser = new User({ name: userData.name, coins: 1000, role: userData.name === 'Admin' ? 'admin' : 'user' });
                await dbUser.save();
            }
            socket.emit('wallet_update', { coins: dbUser.coins, role: dbUser.role });
        } catch (err) { console.error(err); }
    });

    socket.on('toggle_seat', ({ seatIndex }) => {
        const user = socket.data.user || { name: 'User' };
        if (roomState.seats[seatIndex]?.id === socket.id) {
            roomState.seats[seatIndex] = null;
        } else if (!roomState.seats[seatIndex]) {
            roomState.seats = roomState.seats.map(s => s?.id === socket.id ? null : s);
            roomState.seats[seatIndex] = { id: socket.id, name: user.name, muted: false };
        }
        io.emit('update_seats', roomState.seats);
    });

    socket.on('admin_action_coins', async ({ targetUser, amount }) => {
        try {
            let dbUser = await User.findOne({ name: targetUser });
            if(dbUser) {
                dbUser.coins += amount;
                await dbUser.save();
                io.emit('chat_message', { sender: 'Admin 🛡️', text: `${targetUser} ke account me ${amount} coins update kiye gaye hain!` });
            }
        } catch(err) { console.error(err); }
    });

    socket.on('admin_broadcast', ({ message }) => {
        io.emit('chat_message', { sender: 'Admin Announcement 📢', text: message });
    });

    socket.on('send_relationship_request', async ({ targetUser, relationType }) => {
        const sender = socket.data.user?.name || 'User';
        let cost = 0;
        if (relationType.includes('CP')) cost = 500;
        else if (relationType.includes('Sweetheart')) cost = 300;
        else if (relationType.includes('Bestie')) cost = 200;
        else if (relationType.includes('Family')) cost = 100;

        try {
            let dbUser = await User.findOne({ name: sender });
            if (dbUser && dbUser.coins >= cost) {
                dbUser.coins -= cost;
                if (relationType.includes('CP')) dbUser.relationships.cpPartner = targetUser;
                if (relationType.includes('Bestie')) dbUser.relationships.bestie = targetUser;
                if (relationType.includes('Family')) dbUser.relationships.familySquad = targetUser;
                if (relationType.includes('Sweetheart')) dbUser.relationships.sweetheart = targetUser;
                
                await dbUser.save();
                socket.emit('wallet_update', { coins: dbUser.coins, role: dbUser.role });

                io.emit('chat_message', { 
                    sender: 'System 💞', 
                    text: `✨ [Relationship Ring]: ${sender} ne ${cost} coins dekar ${targetUser} ko ${relationType} banne ka proposal bheja hai!` 
                });
            } else {
                socket.emit('error_msg', `Insufficient Coins! ${relationType} ke liye ${cost} coins chahiye.`);
            }
        } catch (err) { console.error(err); }
    });

    socket.on('send_private_msg', ({ toUser, text }) => {
        const sender = socket.data.user?.name || 'Guest';
        const chatKey = getChatKey(sender, toUser);

        if (!privateChats[chatKey]) {
            privateChats[chatKey] = { sender: sender, replied: false };
        } else {
            if (privateChats[chatKey].sender !== sender) {
                privateChats[chatKey].replied = true;
            }
        }

        io.emit('private_msg_receive', {
            from: sender,
            to: toUser,
            text: text,
            canCall: privateChats[chatKey].replied
        });
    });

    socket.on('initiate_private_call', ({ targetUser }) => {
        const sender = socket.data.user?.name || 'User';
        const chatKey = getChatKey(sender, targetUser);
        const chat = privateChats[chatKey];

        if (!chat || !chat.replied) {
            return socket.emit('error_msg', '❌ कॉल ब्लॉक है! जब तक सामने वाला आपके मैसेज का रिप्लाई नहीं देता, कॉल नहीं कर सकते।');
        }

        io.emit('incoming_call_signal', { from: sender, to: targetUser });
    });

    socket.on('disconnect', () => {
        roomState.seats = roomState.seats.map(s => s?.id === socket.id ? null : s);
        io.emit('update_seats', roomState.seats);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
                                                                      
