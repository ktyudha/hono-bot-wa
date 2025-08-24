import whatsappRouter from "@/routes/whatsapp.routes";
export default function coreRoutes(app) {
    // mount semua router di sini
    app.route("/whatsapp", whatsappRouter);
    // pasang ke app utama
    app.route("/api", app);
}
