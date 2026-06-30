import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

type PartDetail = {
  id?: string | number;
  name: string;
  category?: string;
  image_url?: string;
  ai_reference_url?: string;
  prompt_description?: string;
  description?: string;
  color?: string;
  finish?: string;
  material?: string;
  install_area?: string;
  spoke_count?: number | string;
};

type PartReference = {
  id: string;
  refKey: string;
  name: string;
  category: string;
  base64: string;
  mimeType: string;
  sourceUrl: string;
  sourceType: 'ai_reference_url' | 'image_url';
};

function safeText(value: unknown, fallback = '') {
  if (typeof value !== 'string') return fallback;
  return value.trim();
}

function partIdentity(part: PartDetail) {
  return String(part.id || part.name);
}

function getPartRuleText(part: PartDetail) {
  return [
    part.name,
    part.category,
    part.prompt_description,
    part.description,
    part.color,
    part.finish,
    part.material,
    part.spoke_count,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function hasAny(text: string, words: string[]) {
  return words.some((word) => text.includes(word));
}

function getDetectedPartType(part: PartDetail) {
  const text = getPartRuleText(part);

  if (
    hasAny(text, [
      'brake disc rotor',
      'disc brake rotor',
      'brake rotor',
      'rotor',
      'disc brake',
      'brake disc',
      'brake',
      'caliper',
    ])
  ) {
    return 'brake';
  }

  if (
    hasAny(text, [
      'radiator',
      'cooling radiator',
      'big radiator',
      'radiator core',
      'cooler',
      'cooling system',
      'oil cooler',
      'intercooler',
    ])
  ) {
    return 'radiator/cooling';
  }

  if (hasAny(text, ['shock', 'suspension', 'absorber'])) {
    return 'suspension';
  }

  if (
    hasAny(text, [
      'wheel',
      'wheels',
      'rim',
      'rims',
      'mags',
      'mag wheel',
      'racing wheel',
    ])
  ) {
    return 'wheel/rim';
  }

  if (hasAny(text, ['exhaust', 'muffler', 'pipe', 'silencer'])) {
    return 'exhaust/muffler';
  }

  if (hasAny(text, ['headlight', 'head light', 'lamp', 'front light'])) {
    return 'headlight';
  }

  if (hasAny(text, ['seat', 'saddle'])) {
    return 'seat';
  }

  if (hasAny(text, ['mirror', 'side mirror'])) {
    return 'mirror';
  }

  if (hasAny(text, ['decal', 'sticker', 'graphics', 'vinyl'])) {
    return 'decal/sticker';
  }

  if (hasAny(text, ['handlebar', 'handle bar', 'bar end', 'grip'])) {
    return 'handlebar';
  }

  return safeText(part.category, 'part').toLowerCase();
}

function getRequiredSpokeCount(part: PartDetail) {
  const explicit = Number(part.spoke_count);

  if (Number.isFinite(explicit) && explicit > 0) {
    return explicit;
  }

  const text = getPartRuleText(part);
  const numericMatch = text.match(/(?:exactly\s*)?(\d{1,2})\s*[- ]?\s*spokes?/i);

  if (numericMatch) {
    const count = Number(numericMatch[1]);
    if (Number.isFinite(count) && count > 0) return count;
  }

  const wordCounts: Record<string, number> = {
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
  };

  for (const [word, count] of Object.entries(wordCounts)) {
    if (text.includes(`${word}-spoke`) || text.includes(`${word} spoke`)) {
      return count;
    }
  }

  return null;
}

async function fetchAsBase64(url: string) {
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Failed to fetch image: ${url} (${res.status})`);
  }

  const buffer = await res.arrayBuffer();

  const base64 = btoa(
    new Uint8Array(buffer).reduce(
      (data, byte) => data + String.fromCharCode(byte),
      ''
    )
  );

  let mimeType = res.headers.get('content-type') || 'image/jpeg';
  mimeType = mimeType.split(';')[0].trim();

  return { base64, mimeType };
}

function getShortInstruction(part: PartDetail, ref?: PartReference) {
  const type = getDetectedPartType(part);
  const hasReference = Boolean(ref);

  if (type === 'suspension') {
    return hasReference
      ? `Change the existing visible rear shock to the one in [${ref?.refKey}]. Change the spring too. Do not add another shock.`
      : 'Change the existing visible rear shock to the selected rear suspension. Change the spring too. Do not add another shock.';
  }

  if (type === 'seat') {
    return hasReference
      ? `Change the visible seat to the one in [${ref?.refKey}].`
      : 'Change the visible seat to the selected seat.';
  }

  if (type === 'wheel/rim') {
    const spokeCount = getRequiredSpokeCount(part);
    const spokeText = spokeCount
      ? ` Make the wheel have exactly ${spokeCount} main spokes.`
      : '';

    return hasReference
      ? `Change the visible rim/wheel to the one in [${ref?.refKey}].${spokeText} Keep the tire.`
      : `Change the visible rim/wheel to the selected wheel.${spokeText} Keep the tire.`;
  }

  if (type === 'exhaust/muffler') {
    return hasReference
      ? `Change the visible exhaust to the one in [${ref?.refKey}]. Put it in the existing exhaust position. Do not place it as a loose object.`
      : 'Change the visible exhaust to the selected exhaust. Put it in the existing exhaust position. Do not place it as a loose object.';
  }

  if (type === 'brake') {
    return hasReference
      ? `Change the visible brake rotor/brake part to the one in [${ref?.refKey}]. Keep the wheel and tire.`
      : 'Change the visible brake rotor/brake part to the selected brake part. Keep the wheel and tire.';
  }

  if (type === 'headlight') {
    return hasReference
      ? `Change the visible headlight to the one in [${ref?.refKey}].`
      : 'Change the visible headlight to the selected headlight.';
  }

  if (type === 'mirror') {
    return hasReference
      ? `Change the visible mirror to the one in [${ref?.refKey}].`
      : 'Change the visible mirror to the selected mirror.';
  }

  if (type === 'radiator/cooling') {
    return hasReference
      ? `Use [${ref?.refKey}] only as a guide. Put the radiator only inside a real visible cooling opening. Do not paste it on the wheel or background.`
      : 'Put the selected radiator only inside a real visible cooling opening. Do not paste it on the wheel or background.';
  }

  return hasReference
    ? `Change the selected visible part to the one in [${ref?.refKey}].`
    : 'Change the selected visible part to the selected part.';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders,
    });
  }

  try {
    if (!GEMINI_API_KEY) {
      throw new Error('Missing GEMINI_API_KEY environment variable.');
    }

    const body = await req.json();

    const {
      photoUrl,
      partNames,
      partDetails = [],
      motorcycleLabel = 'Customer motorcycle',
      imageSource,
      basePhotoSource,
      basePhotoContext,
    }: {
      photoUrl?: string;
      partNames?: string;
      partDetails?: PartDetail[];
      motorcycleLabel?: string;
      imageSource?: string;
      basePhotoSource?: string;
      basePhotoContext?: string;
    } = body;

    if (!photoUrl) {
      return jsonResponse({
        success: false,
        error: 'photoUrl is required',
      });
    }

    if (!partNames && (!partDetails || partDetails.length === 0)) {
      return jsonResponse({
        success: false,
        error: 'At least one selected part is required',
      });
    }

    const selectedParts: PartDetail[] =
      Array.isArray(partDetails) && partDetails.length > 0
        ? partDetails
        : safeText(partNames)
            .split(/[,\n|]+/)
            .map((name) => name.trim())
            .filter(Boolean)
            .map((name) => ({
              name,
              category: name,
              prompt_description: `Selected motorcycle part: ${name}`,
            }));

    const { base64: bikeBase64, mimeType: bikeMimeType } =
      await fetchAsBase64(photoUrl);

    const partRefs: PartReference[] = [];
    let refCounter = 1;

    for (const part of selectedParts) {
      const referenceUrl = part.ai_reference_url || part.image_url;
      const sourceType: 'ai_reference_url' | 'image_url' = part.ai_reference_url
        ? 'ai_reference_url'
        : 'image_url';

      if (!referenceUrl) continue;

      try {
        const { base64, mimeType } = await fetchAsBase64(referenceUrl);

        partRefs.push({
          id: partIdentity(part),
          refKey: `REFERENCE_IMAGE_${refCounter}`,
          name: part.name,
          category: getDetectedPartType(part),
          base64,
          mimeType,
          sourceUrl: referenceUrl,
          sourceType,
        });

        refCounter++;
      } catch (e) {
        console.error(
          `Could not process reference image for "${part.name}":`,
          e
        );
      }
    }

    const instructions = selectedParts
      .map((part) => {
        const ref = partRefs.find((r) => r.id === partIdentity(part));
        return getShortInstruction(part, ref);
      })
      .join('\n');

    const selectedPartDebug = selectedParts.map((part) => {
      const ref = partRefs.find((r) => r.id === partIdentity(part));
      return {
        id: part.id,
        name: part.name,
        category: part.category,
        detectedType: getDetectedPartType(part),
        hasImageUrl: Boolean(part.image_url),
        hasAiReferenceUrl: Boolean(part.ai_reference_url),
        referenceUrlType: part.ai_reference_url
          ? 'ai_reference_url'
          : part.image_url
          ? 'image_url'
          : null,
        hasUsableReference: Boolean(part.ai_reference_url || part.image_url),
        instruction: getShortInstruction(part, ref),
        installArea: part.install_area,
      };
    });

    const prompt = `
Edit the motorcycle photo.

${instructions}

Keep the same motorcycle, body paint color, decals, stickers, panels, background, lighting, camera angle, and crop.
Reference images affect only the selected part, not the motorcycle body.
Do not change the body color.
Do not change black/blue/gray/red panels unless that panel itself is the selected part.
Do not add extra parts.
Do not add a duplicate part.
Do not paste the reference image as a separate product.
Return one realistic edited photo only.

Motorcycle: ${motorcycleLabel}
Photo source: ${imageSource || 'unknown'}
Base photo source: ${basePhotoSource || 'photoUrl'}
Base photo context: ${basePhotoContext || 'No extra context.'}
`.trim();

    const requestParts: any[] = [
      {
        text: prompt,
      },
      {
        text: '[BASE_IMAGE] motorcycle photo to edit:',
      },
      {
        inline_data: {
          mime_type: bikeMimeType,
          data: bikeBase64,
        },
      },
    ];

    partRefs.forEach((ref) => {
      requestParts.push({
        text: `[${ref.refKey}] reference for "${ref.name}":`,
      });

      requestParts.push({
        inline_data: {
          mime_type: ref.mimeType,
          data: ref.base64,
        },
      });
    });

    async function generate(extraNote?: string) {
      const callParts = extraNote
        ? [...requestParts, { text: extraNote }]
        : requestParts;

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            systemInstruction: {
              parts: [
                {
                  text: `
You are a motorcycle photo editor.
Make the simplest possible localized edit.
Use the reference image only to change the selected part.
Do not add duplicate parts.
Do not paste product photos.
Keep the motorcycle and background unchanged.
`.trim(),
                },
              ],
            },
            contents: [
              {
                parts: callParts,
              },
            ],
            generationConfig: {
              responseModalities: ['IMAGE', 'TEXT'],
              temperature: 0.05,
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

          if (part.inline_data) {
            imageBase64 = part.inline_data.data;
            mimeType = part.inline_data.mime_type || 'image/png';
            break;
          }
        }

        if (imageBase64) break;
      }

      return {
        imageBase64,
        mimeType,
      };
    }

    let {
      imageBase64: generatedImageBase64,
      mimeType: generatedMimeType,
    } = await generate();

    if (!generatedImageBase64) {
      const retry = await generate(
        `
Try again.
Do exactly this:
${instructions}

Keep everything else the same.
Do not add duplicates.
`.trim()
      );

      generatedImageBase64 = retry.imageBase64;
      generatedMimeType = retry.mimeType;
    }

    if (!generatedImageBase64) {
      throw new Error('No image returned from Gemini API.');
    }

    const dataUrl = `data:${generatedMimeType};base64,${generatedImageBase64}`;

    return jsonResponse({
      success: true,
      imageUrl: dataUrl,
      prompt,
      debug: {
        basePhotoUrl: photoUrl,
        basePhotoSource: basePhotoSource || 'photoUrl',
        basePhotoContext: basePhotoContext || null,
        selectedParts: selectedPartDebug,
        referenceImagesUsed: partRefs.map((r) => ({
          name: r.name,
          category: r.category,
          refKey: r.refKey,
          sourceType: r.sourceType,
        })),
      },
    });
  } catch (err) {
    console.error(err);

    const message =
      err instanceof Error ? err.message : 'Failed to generate preview.';

    return jsonResponse({
      success: false,
      error: message,
    });
  }
});
