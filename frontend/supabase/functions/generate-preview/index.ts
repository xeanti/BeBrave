import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function fetchAsBase64(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image: ${url} (${res.status})`);
  const buffer = await res.arrayBuffer();
  const base64 = btoa(
    new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
  );
  const mimeType = res.headers.get('content-type') || 'image/jpeg';
  return { base64, mimeType };
}

// Ask a plain vision-text call to turn the reference photo into a short,
// concrete geometric spec. Text descriptions of shape/count/profile carry
// more weight for structural edits than pixels alone, so this gets fed
// back into the image-edit call as redundant grounding.
async function describePartGeometry(base64: string, mimeType: string, name: string, category: string) {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `Look at this photo of a motorcycle ${category} called "${name}". In one or two short sentences, describe its exact visual geometry so someone could redraw it without seeing the photo: spoke/rib count and shape if applicable, rim/dish profile, overall silhouette, color, and finish (matte/gloss/chrome/anodized). Be concrete and specific. Do not describe the background.`,
                },
                { inline_data: { mime_type: mimeType, data: base64 } },
              ],
            },
          ],
        }),
      }
    );
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    return text?.trim() || null;
  } catch (e) {
    console.error('describePartGeometry failed:', e);
    return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { photoUrl, partNames, partDetails, motorcycleLabel } = await req.json();

    if (!photoUrl || !partNames) {
      return new Response(
        JSON.stringify({ error: 'photoUrl and partNames are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 1. Fetch the base motorcycle photo
    const { base64: bikeBase64, mimeType: bikeMimeType } = await fetchAsBase64(photoUrl);

    // 2. Fetch each part's reference photo AND get a concrete text spec of its geometry
    const partRefs: {
      name: string;
      category: string;
      base64: string;
      mimeType: string;
      geometrySpec: string | null;
    }[] = [];

    for (const part of partDetails || []) {
      if (!part.image_url) continue;
      try {
        const { base64, mimeType } = await fetchAsBase64(part.image_url);
        const geometrySpec = await describePartGeometry(base64, mimeType, part.name, part.category || 'part');
        partRefs.push({ name: part.name, category: part.category || 'part', base64, mimeType, geometrySpec });
      } catch (e) {
        console.error(`Could not process reference image for "${part.name}":`, e);
      }
    }

    const partCategories = (partDetails || [])
      .map((p) => (p.category || '').toLowerCase())
      .join(', ');

    const isWheelJob = partCategories.includes('wheel') || partCategories.includes('rim');

    const partListText = (partDetails || [])
      .map((p, i) => {
        const ref = partRefs.find((r) => r.name === p.name);
        if (!ref) {
          return `  ${i + 1}. "${p.name}" (category: ${p.category || 'part'}) — no reference photo, use name/category as your best guess.`;
        }
        return `  ${i + 1}. "${p.name}" (category: ${p.category || 'part'}) — see [REFERENCE_IMAGE_${i + 1}].${
          ref.geometrySpec ? ` Exact geometry: ${ref.geometrySpec}` : ''
        }`;
      })
      .join('\n');

    const categoryRules = [
      isWheelJob &&
        `- WHEELS/RIMS — this is a FULL SHAPE REPLACEMENT, not a recolor:
   * WRONG result: original spoke pattern kept, just tinted a different color.
   * RIGHT result: the original spoke count and spoke shape are discarded completely and redrawn to match the reference photo's spoke pattern, spoke count, rim dish/profile, and finish — at the same camera angle as the original wheel position.
   * If you are only able to change the color and not the shape, that is a failed result.`,
      (partCategories.includes('exhaust') || partCategories.includes('muffler')) &&
        '- EXHAUST/MUFFLER: replace the pipe shape and bend to match the reference, not just its color.',
      partCategories.includes('headlight') &&
        '- HEADLIGHT: replace the housing/lens shape to match the reference, not just its color.',
      partCategories.includes('seat') &&
        '- SEAT: replace the seat shape/upholstery pattern to match the reference, not just its color.',
      partCategories.includes('mirror') &&
        '- MIRRORS: replace the mirror housing shape to match the reference.',
      (partCategories.includes('decal') || partCategories.includes('sticker')) &&
        '- DECALS/STICKERS: apply the exact decal artwork from the reference onto the body panels.',
      partCategories.includes('footpeg') &&
        '- FOOTPEGS: replace the footpeg shape/material to match the reference.',
    ]
      .filter(Boolean)
      .join('\n');

    const prompt = `
Edit [BASE_IMAGE], a real photo of a ${motorcycleLabel} motorcycle, to install the part(s) below.

PARTS TO INSTALL:
${partListText}

RULES FOR THIS EDIT:
${categoryRules || '- Apply the listed part(s) so the change is clearly visible.'}

IMPORTANT — read carefully:
Matching "color and finish" is not enough on its own. If a part has a different shape than the original (for example a different spoke pattern, a different housing shape, a different silhouette), you must redraw that shape completely. A result that keeps the original part's outline/structure and only shifts its color is INCORRECT and will be rejected.

EVERYTHING ELSE MUST STAY IDENTICAL:
Body shape, paint color, decals, frame, and any part not listed above (including wheels if wheels aren't in the list) must look pixel-for-pixel the same as [BASE_IMAGE] — same background, same lighting, same camera angle, same crop.

Output a single real, unedited-looking photograph. No collage, no side-by-side, no text overlay, no watermark.`.trim();

    const parts: any[] = [
      { text: prompt },
      { text: '[BASE_IMAGE]:' },
      { inline_data: { mime_type: bikeMimeType, data: bikeBase64 } },
    ];

    partRefs.forEach((ref, i) => {
      parts.push({ text: `[REFERENCE_IMAGE_${i + 1}] — exact part to install: "${ref.name}" (${ref.category})` });
      parts.push({ inline_data: { mime_type: ref.mimeType, data: ref.base64 } });
    });

    async function generate(extraNote?: string) {
      const callParts = extraNote ? [...parts, { text: extraNote }] : parts;
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: {
              parts: [
                {
                  text: 'You are a careful photo editor. When asked to swap a part, you change its actual shape to match the reference, not just its color. You only edit what you are told to edit and leave everything else pixel-identical.',
                },
              ],
            },
            contents: [{ parts: callParts }],
            generationConfig: {
              responseModalities: ['IMAGE', 'TEXT'],
              temperature: 0.5,
            },
          }),
        }
      );

      if (!res.ok) {
        const errText = await res.text();
        console.error('Gemini API error response:', errText);
        throw new Error(`Gemini API error (${res.status}): ${errText}`);
      }

      const data = await res.json();
      const candidates = data.candidates || [];
      let imageBase64: string | null = null;
      let mimeType = 'image/png';

      for (const candidate of candidates) {
        for (const part of candidate.content?.parts || []) {
          if (part.inlineData) {
            imageBase64 = part.inlineData.data;
            mimeType = part.inlineData.mimeType || 'image/png';
            break;
          }
        }
        if (imageBase64) break;
      }

      return { imageBase64, mimeType };
    }

    // First attempt
    let { imageBase64: generatedImageBase64, mimeType: generatedMimeType } = await generate();

    // Quick automatic retry once, specifically nudging against the "recolor only" failure mode,
    // if a wheel/shape-sensitive job was requested. This costs one extra call but meaningfully
    // raises the odds of a structurally correct result given how stochastic image generation is.
    if (!generatedImageBase64 && isWheelJob) {
      const retry = await generate(
        'Your previous attempt did not return an image. Try again: fully redraw the requested part\'s shape to match its reference photo, not just its color.'
      );
      generatedImageBase64 = retry.imageBase64;
      generatedMimeType = retry.mimeType;
    }

    if (!generatedImageBase64) {
      throw new Error('No image returned from Gemini API.');
    }

    const dataUrl = `data:${generatedMimeType};base64,${generatedImageBase64}`;

    return new Response(
      JSON.stringify({ imageUrl: dataUrl, prompt }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error(err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});