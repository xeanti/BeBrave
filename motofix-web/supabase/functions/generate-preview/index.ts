import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type PartDetail = {
  id?: string | number;
  name: string;
  category?: string;
  image_url?: string;
  prompt_description?: string;
  description?: string;
  color?: string;
  finish?: string;
  material?: string;
  install_area?: string;
};

type PartReference = {
  id: string;
  refKey: string;
  name: string;
  category: string;
  base64: string;
  mimeType: string;
  geometrySpec: string | null;
};

function safeText(value: unknown, fallback = '') {
  if (typeof value !== 'string') return fallback;
  return value.trim();
}

function partIdentity(part: PartDetail) {
  return String(part.id || part.name);
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

function getTargetArea(categoryRaw: string, installArea?: string) {
  if (installArea && installArea.trim()) {
    return installArea.trim();
  }

  const category = categoryRaw.toLowerCase();

  if (category.includes('wheel') || category.includes('rim')) {
    return 'front and/or rear wheel/rim area only; preserve tire size, axle position, brake position, and motorcycle stance';
  }

  if (category.includes('exhaust') || category.includes('muffler')) {
    return 'exhaust or muffler area only; preserve mounting position, side fairing, frame, and nearby body panels';
  }

  if (category.includes('headlight')) {
    return 'front headlight housing and lens area only; preserve front fairing shape unless the selected headlight requires a small realistic fit adjustment';
  }

  if (category.includes('seat')) {
    return 'seat area only; preserve body panels, frame, tail section, and motorcycle stance';
  }

  if (category.includes('mirror')) {
    return 'left and/or right mirror area only; preserve handlebar position and front controls';
  }

  if (category.includes('decal') || category.includes('sticker')) {
    return 'body panel surface only; apply the decal artwork without changing the motorcycle body shape';
  }

  if (category.includes('footpeg') || category.includes('rearset')) {
    return 'footpeg or rearset area only; preserve frame, side fairing, and engine area';
  }

  if (category.includes('handlebar') || category.includes('bar')) {
    return 'handlebar area only; preserve front fork, controls, mirrors unless mirrors are also selected, and dashboard position';
  }

  if (category.includes('fairing') || category.includes('body')) {
    return 'matching body panel or fairing area only; preserve all unrelated motorcycle components';
  }

  if (category.includes('brake')) {
    return 'brake component area only; preserve wheel alignment, fork position, and tire size';
  }

  if (category.includes('suspension') || category.includes('shock')) {
    return 'suspension or shock absorber area only; preserve frame geometry and motorcycle stance';
  }

  return 'the exact visible location where this motorcycle part normally belongs';
}

function getCategoryRules(partCategories: string) {
  const rules = [
    (partCategories.includes('wheel') || partCategories.includes('rim')) &&
      `- WHEELS/RIMS:
  * This is a full wheel/rim shape replacement, not a recolor.
  * Replace the spoke count, spoke shape, rim profile, dish depth, color, and finish to match the reference image.
  * Preserve tire size, axle position, brake disc position, suspension position, and motorcycle stance.
  * Do not change the motorcycle body panels or background.`,

    (partCategories.includes('exhaust') || partCategories.includes('muffler')) &&
      `- EXHAUST/MUFFLER:
  * Replace the exhaust body, pipe bend, canister shape, tip shape, color, and finish to match the reference image.
  * Preserve the mounting area and do not change unrelated side fairings or engine parts.`,

    partCategories.includes('headlight') &&
      `- HEADLIGHT:
  * Replace the housing and lens shape to match the reference image.
  * Keep the front fairing, handlebar, fork, and body color unchanged unless a small fit adjustment is required.`,

    partCategories.includes('seat') &&
      `- SEAT:
  * Replace the seat silhouette, height, cushion shape, upholstery texture, stitching, and color to match the reference image.
  * Do not change the tail fairing, side panels, frame, or background.`,

    partCategories.includes('mirror') &&
      `- MIRRORS:
  * Replace the mirror housing, stem shape, size, and finish to match the reference image.
  * Keep the handlebar and controls unchanged.`,

    (partCategories.includes('decal') || partCategories.includes('sticker')) &&
      `- DECALS/STICKERS:
  * Apply only the selected decal/sticker artwork to the correct body panel.
  * Do not change the motorcycle body shape, lighting, or base paint unless the decal design includes visible color coverage.`,

    (partCategories.includes('footpeg') || partCategories.includes('rearset')) &&
      `- FOOTPEGS/REARSETS:
  * Replace the footpeg/rearset shape, material, and finish to match the reference image.
  * Keep the frame, side fairing, and engine area unchanged.`,

    (partCategories.includes('handlebar') || partCategories.includes('bar')) &&
      `- HANDLEBAR:
  * Replace the handlebar shape, rise, sweep, and finish to match the reference image.
  * Preserve cables, controls, dashboard, and front fork as much as realistically possible.`,

    (partCategories.includes('fairing') || partCategories.includes('body')) &&
      `- FAIRING/BODY PART:
  * Replace only the selected body panel or fairing area.
  * Preserve all unrelated panels, wheels, seat, background, and lighting.`,

    partCategories.includes('brake') &&
      `- BRAKE PART:
  * Replace only the selected brake component.
  * Preserve wheel alignment, tire size, fork position, and motorcycle stance.`,

    (partCategories.includes('suspension') || partCategories.includes('shock')) &&
      `- SUSPENSION/SHOCK:
  * Replace only the selected suspension or shock absorber component.
  * Preserve frame geometry, wheel position, and motorcycle stance.`,
  ];

  return rules.filter(Boolean).join('\n\n');
}

async function describePartGeometry(
  base64: string,
  mimeType: string,
  name: string,
  category: string
) {
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
                  text: `
Look at this motorcycle ${category} called "${name}".

Describe only the part itself, not the background.

In 1 to 2 short sentences, describe:
- exact shape/silhouette
- visible structure
- spoke/rib count if applicable
- color
- material
- finish such as matte, gloss, chrome, carbon fiber, anodized, rubber, leather, or plastic
- any unique detail needed to redraw it accurately

Be concrete and specific.
`.trim(),
                },
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: base64,
                  },
                },
              ],
            },
          ],
        }),
      }
    );

    if (!res.ok) {
      const text = await res.text();
      console.error('Geometry description API error:', text);
      return null;
    }

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
    }: {
      photoUrl?: string;
      partNames?: string;
      partDetails?: PartDetail[];
      motorcycleLabel?: string;
      imageSource?: string;
    } = body;

    if (!photoUrl) {
      return new Response(
        JSON.stringify({ error: 'photoUrl is required' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (!partNames && (!partDetails || partDetails.length === 0)) {
      return new Response(
        JSON.stringify({ error: 'At least one selected part is required' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const selectedParts = Array.isArray(partDetails) ? partDetails : [];

    const { base64: bikeBase64, mimeType: bikeMimeType } =
      await fetchAsBase64(photoUrl);

    const partRefs: PartReference[] = [];
    let refCounter = 1;

    for (const part of selectedParts) {
      if (!part.image_url) continue;

      try {
        const { base64, mimeType } = await fetchAsBase64(part.image_url);

        const geometrySpec = await describePartGeometry(
          base64,
          mimeType,
          part.name,
          part.category || 'part'
        );

        partRefs.push({
          id: partIdentity(part),
          refKey: `REFERENCE_IMAGE_${refCounter}`,
          name: part.name,
          category: part.category || 'part',
          base64,
          mimeType,
          geometrySpec,
        });

        refCounter++;
      } catch (e) {
        console.error(
          `Could not process reference image for "${part.name}":`,
          e
        );
      }
    }

    const partCategories = selectedParts
      .map((p) => safeText(p.category).toLowerCase())
      .join(', ');

    const isShapeSensitiveJob =
      partCategories.includes('wheel') ||
      partCategories.includes('rim') ||
      partCategories.includes('exhaust') ||
      partCategories.includes('muffler') ||
      partCategories.includes('headlight') ||
      partCategories.includes('seat') ||
      partCategories.includes('mirror') ||
      partCategories.includes('handlebar') ||
      partCategories.includes('fairing') ||
      partCategories.includes('body') ||
      partCategories.includes('footpeg') ||
      partCategories.includes('rearset') ||
      partCategories.includes('brake') ||
      partCategories.includes('suspension') ||
      partCategories.includes('shock');

    const categoryRules =
      getCategoryRules(partCategories) ||
      '- Apply each selected part clearly and realistically to the correct motorcycle area.';

    const partListText = selectedParts
      .map((part, index) => {
        const ref = partRefs.find((r) => r.id === partIdentity(part));
        const category = part.category || 'part';
        const targetArea = getTargetArea(category, part.install_area);

        const extraDescription =
          part.prompt_description ||
          part.description ||
          '';

        const details = [
          `PART ${index + 1}`,
          `- Name: ${part.name}`,
          `- Category: ${category}`,
          `- Target area to edit: ${targetArea}`,
          `- Reference image: ${ref ? `[${ref.refKey}]` : 'No reference image provided'}`,
          `- Required result: Install this exact selected part onto the motorcycle. Match the part reference as closely as possible.`,
        ];

        if (extraDescription) {
          details.push(`- Shop description: ${extraDescription}`);
        }

        if (part.color) {
          details.push(`- Required color: ${part.color}`);
        }

        if (part.finish) {
          details.push(`- Required finish: ${part.finish}`);
        }

        if (part.material) {
          details.push(`- Required material: ${part.material}`);
        }

        if (ref?.geometrySpec) {
          details.push(`- Reference geometry: ${ref.geometrySpec}`);
        }

        return details.join('\n');
      })
      .join('\n\n');

    const prompt = `
You are editing one real motorcycle photo.

BASE PHOTO:
[BASE_IMAGE] is the original motorcycle photo. It must remain the same except for the exact selected parts listed below.

MOTORCYCLE:
${motorcycleLabel || 'Customer motorcycle'}

PHOTO SOURCE:
${imageSource || 'unknown'}

SELECTED PARTS TO INSTALL:
${partListText}

CORE INSTRUCTION:
Install each selected part onto the correct target area of the motorcycle in [BASE_IMAGE].
Use the matching reference image for each part as the exact visual source.

REFERENCE PRIORITY:
1. The reference image controls the final appearance.
2. The geometry description explains the reference image.
3. The shop description, color, material, and finish are additional constraints.
4. The part name and category explain where the part belongs.
5. Do not invent a different design if a reference image is provided.

STRICT EDITING RULES:
- Edit only the selected part areas.
- Do not change the motorcycle model, body shape, body paint, background, lighting, camera angle, crop, or perspective.
- Do not change unrelated motorcycle parts.
- Do not add extra accessories, stickers, decals, lights, wheels, pipes, mirrors, or decorations that were not selected.
- Do not remove parts unless they are being replaced by the selected part.
- Match the reference part's actual shape, structure, silhouette, material, color, finish, and orientation.
- Do not only recolor the original part. If the selected part has a different shape, redraw the shape completely.
- Keep the installed part realistic, properly scaled, aligned, mounted, and physically possible.
- If multiple parts are selected, install all selected parts at the same time, each in its own correct target area.
- If two selected parts are near each other, keep them visually separate and do not merge their shapes.

CATEGORY-SPECIFIC RULES:
${categoryRules}

FAIL CONDITIONS:
The result is wrong if:
- the original part is only recolored;
- the selected part shape does not match the reference image;
- the wrong part is installed in the wrong location;
- one selected part is ignored;
- two selected parts are mixed together;
- unrelated motorcycle parts are changed;
- the motorcycle becomes a different model;
- extra parts or decorations are added;
- the result becomes a drawing, render, cartoon, collage, or product mockup.

OUTPUT:
Return one realistic edited photograph only.
No collage.
No side-by-side comparison.
No labels.
No text overlay.
No watermark.
No frame.
`.trim();

    const requestParts: any[] = [
      {
        text: prompt,
      },
      {
        text: '[BASE_IMAGE] — original motorcycle photo to edit:',
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
        text: `[${ref.refKey}] — exact reference image for "${ref.name}" (${ref.category}):`,
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
You are a careful professional motorcycle photo editor.
When asked to replace or install a part, you change the actual shape and structure to match the reference image, not just the color.
You only edit the requested selected parts and leave all unrelated areas unchanged.
You must avoid mixing selected parts together.
The final result must look like one realistic unedited photograph.
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
              temperature: 0.2,
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

    if (!generatedImageBase64 && isShapeSensitiveJob) {
      const retry = await generate(
        `
Try again and return an image.
Important correction:
Do not recolor only.
Fully replace the selected part shape and structure with the matching reference image.
Do not mix selected parts together.
Do not change unrelated motorcycle areas.
`.trim()
      );

      generatedImageBase64 = retry.imageBase64;
      generatedMimeType = retry.mimeType;
    }

    if (!generatedImageBase64) {
      throw new Error('No image returned from Gemini API.');
    }

    const dataUrl = `data:${generatedMimeType};base64,${generatedImageBase64}`;

    return new Response(
      JSON.stringify({
        imageUrl: dataUrl,
        prompt,
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (err) {
    console.error(err);

    const message =
      err instanceof Error ? err.message : 'Failed to generate preview.';

    return new Response(
      JSON.stringify({
        error: message,
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});