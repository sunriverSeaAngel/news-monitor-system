import { Router, type IRouter, type Request, type Response } from "express";
import multer from "multer";
import OpenAI, { toFile } from "openai";

const router: IRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB — Whisper limit
  fileFilter: (_req, file, cb) => {
    const allowed = ["audio/mpeg", "audio/mp4", "audio/wav", "audio/webm", "audio/ogg", "video/webm", "audio/x-m4a", "audio/flac"];
    if (allowed.includes(file.mimetype) || file.originalname.match(/\.(mp3|mp4|m4a|wav|webm|ogg|flac)$/i)) {
      cb(null, true);
    } else {
      cb(new Error("Unsupported audio format"));
    }
  },
});

function getOpenAIClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

router.post(
  "/speech-to-text",
  upload.single("audio"),
  async (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ error: "Поле 'audio' обязательно (multipart/form-data)" });
      return;
    }

    const openai = getOpenAIClient();
    if (!openai) {
      res.status(503).json({ error: "OpenAI API недоступен — проверьте OPENAI_API_KEY" });
      return;
    }

    try {
      const buffer = req.file.buffer;
      const filename = req.file.originalname || "audio.webm";
      const mimeType = req.file.mimetype || "audio/webm";

      const file = await toFile(buffer, filename, { type: mimeType });

      const transcription = await openai.audio.transcriptions.create({
        file,
        model: "whisper-1",
        response_format: "text",
      });

      res.json({ text: transcription });
    } catch (err: unknown) {
      req.log.error({ err }, "Whisper transcription failed");
      const message = err instanceof Error ? err.message : "Ошибка транскрипции";
      res.status(500).json({ error: message });
    }
  },
);

export default router;
