import { createWorker } from 'tesseract.js';

/**
 * OCR local, sans appel réseau : `tesseract.js` télécharge son modèle de
 * langue une première fois puis tourne entièrement en local. Aucun
 * document envoyé à un tiers — condition posée par la spec (v1 gratuite).
 */
export async function extraireTexte(image: Buffer): Promise<string> {
  const worker = await createWorker('fra');
  try {
    const {
      data: { text },
    } = await worker.recognize(image);
    return text;
  } finally {
    await worker.terminate();
  }
}
