document.addEventListener('DOMContentLoaded', () => {
    // Inject chat HTML
    const chatHtml = `
        <div id="chatbot-widget">
            <button id="chat-toggle-btn">💬</button>
            <div id="chat-window">
                <div class="chat-header">
                    <h3>Support Chat</h3>
                    <button id="close-chat">&times;</button>
                </div>
                <div class="chat-messages" id="chat-messages">
                    <div class="message bot">Hello! I'm the GentsStyling support assistant. How can I help you today?</div>
                </div>
                <div class="chat-input-area">
                    <input type="text" id="chat-input" placeholder="Type your message..." />
                    <button id="send-btn">➤</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', chatHtml);

    const chatToggleBtn = document.getElementById('chat-toggle-btn');
    const chatWindow = document.getElementById('chat-window');
    const closeChatBtn = document.getElementById('close-chat');
    const chatMessages = document.getElementById('chat-messages');
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');

    // Generate a simple session ID
    const sessionId = 'session_' + Math.random().toString(36).substr(2, 9);

    // Toggle Chat Window
    chatToggleBtn.addEventListener('click', () => {
        chatWindow.classList.toggle('open');
        if (chatWindow.classList.contains('open')) {
            chatInput.focus();
        }
    });

    closeChatBtn.addEventListener('click', () => {
        chatWindow.classList.remove('open');
    });

    function addMessage(text, sender) {
        const msgDiv = document.createElement('div');
        msgDiv.classList.add('message', sender);
        
        // Basic check for escalation
        if (text.includes('[ESCALATE]')) {
            text = text.replace('[ESCALATE]', '');
            msgDiv.innerHTML = text; // allow basic html if needed
            
            const escalateDiv = document.createElement('div');
            escalateDiv.className = 'escalate-msg';
            escalateDiv.innerHTML = `Need human help? <br>Email: <a href="mailto:support@gentsstyling.com">support@gentsstyling.com</a><br>WhatsApp: <a href="https://wa.me/18001234567" target="_blank">+1-800-123-4567</a>`;
            
            const wrapper = document.createElement('div');
            wrapper.appendChild(msgDiv);
            wrapper.appendChild(escalateDiv);
            chatMessages.appendChild(wrapper);
        } else {
             msgDiv.textContent = text;
             chatMessages.appendChild(msgDiv);
        }

        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function addTypingIndicator() {
        const indicator = document.createElement('div');
        indicator.className = 'message bot typing-indicator';
        indicator.id = 'typing-indicator';
        indicator.innerHTML = `
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
        `;
        chatMessages.appendChild(indicator);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function removeTypingIndicator() {
        const indicator = document.getElementById('typing-indicator');
        if (indicator) {
            indicator.remove();
        }
    }

    async function sendMessage() {
        const text = chatInput.value.trim();
        if (!text) return;

        // Add user message
        addMessage(text, 'user');
        chatInput.value = '';

        // Show typing indicator
        addTypingIndicator();

        try {
            const response = await fetch('http://localhost:3000/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ message: text, sessionId })
            });

            removeTypingIndicator();

            if (!response.ok) {
                throw new Error('Network response was not ok');
            }

            const data = await response.json();
            addMessage(data.reply, 'bot');

        } catch (error) {
            console.error('Error:', error);
            removeTypingIndicator();
            addMessage("I'm sorry, I'm having trouble connecting to the server right now. Please try again later.", 'bot');
        }
    }

    sendBtn.addEventListener('click', sendMessage);

    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });
});
