import { Client, LocalAuth, MessageMedia } from "whatsapp-web.js";
import * as qrcode from "qrcode-terminal";
export class WhatsAppService {
    client;
    isReady = false;
    constructor() {
        this.client = new Client({
            authStrategy: new LocalAuth(),
            puppeteer: {
                headless: true,
                args: ["--no-sandbox", "--disable-setuid-sandbox"],
            },
        });
        this.initializeEvents();
    }
    initializeEvents() {
        this.client.on("qr", (qr) => {
            console.log("QR Code received, scan dengan WhatsApp Anda:");
            qrcode.generate(qr, { small: true });
        });
        this.client.on("ready", () => {
            console.log("WhatsApp client is ready!");
            this.isReady = true;
        });
        this.client.on("authenticated", () => {
            console.log("Authenticated successfully");
        });
        this.client.on("auth_failure", (msg) => {
            console.error("Authentication failed:", msg);
        });
        this.client.on("disconnected", (reason) => {
            console.log("Client was logged out", reason);
            this.isReady = false;
        });
        // Handle incoming messages
        this.client.on("message", this.handleIncomingMessage.bind(this));
    }
    async handleIncomingMessage(message) {
        try {
            console.log(`Received message from ${message.from}: ${message.body}`);
            // Contoh handler sederhana
            if (message.body.toLowerCase() === "ping") {
                await message.reply("pong");
            }
            if (message.body.toLowerCase() === "info") {
                const chat = await message.getChat();
                await message.reply(`Chat ID: ${chat.id._serialized}`);
            }
        }
        catch (error) {
            console.error("Error handling message:", error);
        }
    }
    async initialize() {
        try {
            await this.client.initialize();
            console.log("WhatsApp client initialized");
        }
        catch (error) {
            console.error("Failed to initialize WhatsApp client:", error);
            throw error;
        }
    }
    async sendMessage(to, message) {
        if (!this.isReady) {
            throw new Error("WhatsApp client is not ready");
        }
        try {
            // Format nomor harus dengan kode negara
            const formattedNumber = to.replace(/\D/g, "");
            const chatId = `${formattedNumber}@c.us`;
            await this.client.sendMessage(chatId, message);
            console.log(`Message sent to ${to}`);
        }
        catch (error) {
            console.error("Error sending message:", error);
            throw error;
        }
    }
    async sendMedia(to, mediaUrl, caption) {
        if (!this.isReady) {
            throw new Error("WhatsApp client is not ready");
        }
        try {
            const formattedNumber = to.replace(/\D/g, "");
            const chatId = `${formattedNumber}@c.us`;
            const media = await MessageMedia.fromUrl(mediaUrl);
            await this.client.sendMessage(chatId, media, { caption });
            console.log(`Media sent to ${to}`);
        }
        catch (error) {
            console.error("Error sending media:", error);
            throw error;
        }
    }
    async getChats() {
        if (!this.isReady) {
            throw new Error("WhatsApp client is not ready");
        }
        try {
            const chats = await this.client.getChats();
            return chats.map((chat) => ({
                id: chat.id._serialized,
                name: chat.name,
                isGroup: chat.isGroup,
                timestamp: chat.timestamp,
            }));
        }
        catch (error) {
            console.error("Error getting chats:", error);
            throw error;
        }
    }
    getStatus() {
        return {
            isReady: this.isReady,
            isAuthenticated: this.client.info !== undefined,
        };
    }
    async logout() {
        try {
            await this.client.logout();
            this.isReady = false;
            console.log("Logged out successfully");
        }
        catch (error) {
            console.error("Error logging out:", error);
            throw error;
        }
    }
    async destroy() {
        try {
            await this.client.destroy();
            this.isReady = false;
            console.log("Client destroyed");
        }
        catch (error) {
            console.error("Error destroying client:", error);
            throw error;
        }
    }
}
export const whatsappService = new WhatsAppService();
