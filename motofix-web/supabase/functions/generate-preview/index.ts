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
  geometrySpec: string | null;
};

function safeText(value: unknown, fallback = '') {
  if (typeof value !== 'string') return fallback;
  return value.trim();
}

function partIdentity(part: PartDetail) {
  return String(part.id || part.name);
}

function getPartSearchText(part: PartDetail) {
  return [
    part.name,
    part.category,
    part.prompt_description,
    part.description,
    part.install_area,
    part.color,
    part.finish,
    part.material,
    part.spoke_count,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
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
  const text = typeof getPartRuleText === 'function'
    ? getPartRuleText(part)
    : getPartSearchText(part);

  /*
    Detection priority matters:
    - Brake rotors mention wheel hub, so brake must come before wheel.
    - Radiators may mention front wheel/side area in install instructions,
      so radiator/cooling must also come before wheel.
  */
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

  if (hasAny(text, ['footpeg', 'foot peg', 'rearset', 'rear set'])) {
    return 'footpeg/rearset';
  }

  if (hasAny(text, ['handlebar', 'handle bar', 'bar end', 'grip'])) {
    return 'handlebar';
  }

  if (hasAny(text, ['shock', 'suspension', 'fork', 'absorber'])) {
    return 'suspension';
  }

  return safeText(part.category, 'part');
}

function getRequiredSpokeCount(part: PartDetail, geometrySpec?: string | null) {
  const explicit = Number(part.spoke_count);

  if (Number.isFinite(explicit) && explicit > 0) {
    return explicit;
  }

  const text = [
    part.name,
    part.category,
    part.prompt_description,
    part.description,
    part.install_area,
    geometrySpec,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

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

function isWheelPart(part: PartDetail) {
  return getDetectedPartType(part) === 'wheel/rim';
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

  if (
    category.includes('wheel') ||
    category.includes('rim') ||
    category.includes('mags')
  ) {
    return 'front and/or rear wheel/rim area only; replace the visible rim/spoke structure while preserving tire size, axle position, brake disc position, fork/swingarm position, and motorcycle stance';
  }

  if (
    category.includes('exhaust') ||
    category.includes('muffler') ||
    category.includes('pipe')
  ) {
    return 'exhaust or muffler area only; preserve mounting position, frame and nearby body panels';
  }

  if (category.includes('headlight') || category.includes('lamp')) {
    return 'front headlight housing and lens area only; preserve front body shape unless the selected headlight requires a small realistic fit adjustment';
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
    return 'footpeg or rearset area only; preserve frame, engine area';
  }

  if (category.includes('handlebar') || category.includes('bar')) {
    return 'handlebar area only; preserve front fork, controls, mirrors unless mirrors are also selected, and dashboard position';
  }

  if (
    category.includes('radiator') ||
    category.includes('cooling') ||
    category.includes('cooler')
  ) {
    return 'visible radiator or cooling-core mounting area only; install the radiator behind/inside the existing cooling vent, lower front/side opening, or actual radiator bay if visible; keep it small, recessed, aligned with the scooter frame, and never place it on top of the wheel, tire, fender, fork, ground, or blank background';
  }

  if (category.includes('brake') || category.includes('disc') || category.includes('rotor') || category.includes('caliper')) {
    return 'front or rear brake rotor/component area only; if the selected part is a brake disc rotor, replace only the visible rotor mounted at the wheel hub, keep it aligned behind the brake caliper and inside the rim, and preserve the rim, tire, fork, axle, wheel position, body color, decals, lighting, camera angle, and background';
  }

  if (
    category.includes('suspension') ||
    category.includes('shock') ||
    category.includes('absorber')
  ) {
    return 'existing rear shock absorber/suspension area only; locate the currently visible rear shock and transform that same shock into the selected reference shock; the visible coil spring must be replaced to match the reference spring color and shape; do not change only the reservoir/cup; do not add a second shock, auxiliary shock, duplicate spring, extra reservoir, or detached suspension; preserve frame geometry, swingarm position, wheel, tire, exhaust, body panels, lighting, camera angle, crop, and background';
  }

  return 'the exact visible location where this motorcycle part normally belongs';
}

function getCategoryRules(partCategories: string) {
  const rules = [
    (partCategories.includes('wheel') ||
      partCategories.includes('rim') ||
      partCategories.includes('mags')) &&
      `- WHEELS/RIMS / MAGS:
  * This is a physical rim/mags replacement, not a paint recolor.
  * Replace only the rim and spoke structure inside the existing tire.
  * The final rim must match the selected reference image's exact spoke count and spoke layout.
  * Spoke count is mandatory. If the selected part says 3-spoke or the reference image shows 3 main spokes, the final rim must visibly have exactly 3 main spokes.
  * Match the spoke thickness, spoke curvature, spoke spacing, center hub shape, rim lip, inner cutouts, color, material, and finish.
  * Preserve the original tire, brake disc rotor, brake caliper, axle, fork, front fender, motorcycle body, lighting, camera angle, crop, and background.
  * The brake disc rotor and brake caliper must remain visible in front of the new rim.
  * Do not create extra spokes, thin spokes, small repeated spokes, or a different spoke pattern.
  * Do not keep the original spoke pattern and simply tint it gold.`,

    (partCategories.includes('exhaust') ||
      partCategories.includes('muffler') ||
      partCategories.includes('pipe')) &&
      `- EXHAUST/MUFFLER:
  * The exhaust must be physically installed on the motorcycle, attached to the correct exhaust path near the engine and rear wheel.
  * Replace the existing exhaust body, pipe bend, canister shape, tip shape, color, and finish to match the reference image.
  * Do not place the exhaust pipe as a separate loose product on the ground, below the motorcycle, beside the motorcycle, or in the blank background.
  * Do not copy the reference product photo as a standalone object.
  * Do not show product packaging, product background, product shadow, label, or catalog layout.
  * Preserve the motorcycle body color, decals, panels, wheel, tire, brake rotor, seat, lighting, camera angle, crop, and background.
  * If the exact pipe cannot be fully visible from the angle, show only the realistic visible installed section instead of adding a detached pipe.`,

    partCategories.includes('headlight') &&
      `- HEADLIGHT:
  * Replace the housing and lens shape to match the reference image.
  * Keep the handlebar, fork, and body color unchanged unless a small fit adjustment is required.`,

    partCategories.includes('seat') &&
      `- SEAT:
  * Replace the seat silhouette, height, cushion shape, upholstery texture, stitching, and color to match the reference image.
  * Do not change the side panels, frame, or background.`,

    partCategories.includes('mirror') &&
      `- MIRRORS:
  * Replace the mirror housing, stem shape, size, and finish to match the reference image.
  * Keep the handlebar and controls unchanged.`,

    (partCategories.includes('decal') || partCategories.includes('sticker')) &&
      `- DECALS/STICKERS:
  * Apply only the selected decal/sticker artwork to the correct body panel.
  * Do not change the motorcycle body shape, lighting, or base paint unless the decal design includes visible color coverage.`,

    (partCategories.includes('footpeg') ||
      partCategories.includes('rearset')) &&
      `- FOOTPEGS/REARSETS:
  * Replace the footpeg/rearset shape, material, and finish to match the reference image.
  * Keep the frame, engine area unchanged.`,

    (partCategories.includes('handlebar') || partCategories.includes('bar')) &&
      `- HANDLEBAR:
  * Replace the handlebar shape, rise, sweep, and finish to match the reference image.
  * Preserve cables, controls, dashboard, and front fork as much as realistically possible.`,

    (partCategories.includes('radiator') ||
      partCategories.includes('cooling') ||
      partCategories.includes('cooler')) &&
      `- RADIATOR / COOLING PART:
  * The radiator must be physically installed in the motorcycle's visible radiator/cooling area only.
  * Do not place the radiator on top of the wheel, tire, fender, fork, ground, blank background, or outside the motorcycle.
  * Do not copy the reference radiator product photo as a separate object.
  * Do not show product packaging, product background, product shadow, label, or catalog layout.
  * If the scooter's actual radiator mount is not clearly visible, show only a realistic partial radiator core behind an existing vent/opening instead of pasting the full rectangular product.
  * Keep the radiator recessed behind the panel/vent area, correctly scaled, aligned with the frame, and partially occluded if needed.
  * Preserve the wheel, tire, brake rotor, caliper, fork, body color, decals, panels, seat, lighting, camera angle, crop, and background.`,

    (partCategories.includes('brake') ||
      partCategories.includes('disc') ||
      partCategories.includes('rotor') ||
      partCategories.includes('caliper')) &&
      `- BRAKE DISC ROTOR / BRAKE PART:
  * Replace only the selected brake disc rotor or brake component in the correct wheel hub/brake area.
  * If the selected part is a brake disc rotor, the final result must visibly replace the original stock rotor design.
  * The new rotor must clearly show the selected reference design, including the outer shape, wave/petal edge if present, drilled hole pattern, inner carrier shape, floating bobbins, color, and finish.
  * If the selected rotor has a black inner carrier and silver outer rotor ring, those features must be clearly visible in the final result.
  * Do not leave the original stock round rotor unchanged.
  * Do not only recolor or sharpen the existing rotor.
  * Do not turn the rotor into a sticker, overlay, floating object, or flat decal.
  * Keep the rotor centered on the wheel hub and aligned with the axle, fork, and brake caliper.
  * The brake caliper should remain in front of or around the rotor naturally; do not cover the caliper with the new rotor.
  * Keep the rim, tire, brake caliper, fork, axle, body color, decals, lighting, angle, crop, and background unchanged.
  * Preserve wheel alignment, tire size, fork position, and motorcycle stance.`,

    (partCategories.includes('suspension') ||
      partCategories.includes('shock') ||
      partCategories.includes('absorber')) &&
      `- SUSPENSION / REAR SHOCK:
  * This is a replacement, not an added accessory.
  * Locate the existing visible rear shock absorber on the motorcycle.
  * Transform that same existing shock into the selected reference shock.
  * The coil spring is the primary visible component. The visible coil spring must change to match the selected reference spring color, shape, thickness, spacing, and finish.
  * If the selected reference shock has a gold/yellow spring, the final visible spring must be gold/yellow.
  * Do not change only the reservoir, cup, cap, sticker, or small top/bottom hardware while leaving the original spring unchanged.
  * The result is wrong if the old red/black/silver spring remains visible and only the reservoir/cup changes.
  * Do not add a second shock, duplicate spring, extra auxiliary shock, extra reservoir, or extra mounting bracket.
  * The original shock must not remain visible as a separate old shock beside the new one.
  * Keep only the realistic number of shocks visible for the original motorcycle view. For a single-shock scooter view, show one installed shock only.
  * Match the selected reference shock's spring color, shock body, reservoir if present, mounting eyelets, material, and finish.
  * Preserve the original mounting points between the frame and swingarm/rear wheel area.
  * Preserve frame geometry, wheel position, tire, exhaust, body panels, lighting, camera angle, crop, and background.`, 
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
- if it is a wheel/rim, write the exact count like: SPOKE_COUNT: 3
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
        const detectedType = getDetectedPartType(part);

        const geometrySpec = await describePartGeometry(
          base64,
          mimeType,
          part.name,
          detectedType || part.category || 'part'
        );

        partRefs.push({
          id: partIdentity(part),
          refKey: `REFERENCE_IMAGE_${refCounter}`,
          name: part.name,
          category: detectedType || part.category || 'part',
          base64,
          mimeType,
          sourceUrl: referenceUrl,
          sourceType,
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
      .map((p) => `${getDetectedPartType(p)} ${getPartRuleText(p)}`)
      .join(', ')
      .toLowerCase();

    const isShapeSensitiveJob =
      partCategories.includes('wheel') ||
      partCategories.includes('rim') ||
      partCategories.includes('mags') ||
      partCategories.includes('exhaust') ||
      partCategories.includes('muffler') ||
      partCategories.includes('pipe') ||
      partCategories.includes('radiator') ||
      partCategories.includes('cooling') ||
      partCategories.includes('cooler') ||
      partCategories.includes('headlight') ||
      partCategories.includes('seat') ||
      partCategories.includes('mirror') ||
      partCategories.includes('handlebar') ||
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
        const detectedType = getDetectedPartType(part);

        const targetArea = getTargetArea(
          `${detectedType} ${getPartSearchText(part)}`,
          part.install_area
        );

        const extraDescription =
          part.prompt_description || part.description || '';

        const requiredSpokeCount = getRequiredSpokeCount(part, ref?.geometrySpec);

        const details = [
          `PART ${index + 1}`,
          `- Name: ${part.name}`,
          `- Category: ${category}`,
          `- Detected part type: ${detectedType}`,
          `- Mandatory edit behavior: Replace the actual physical part geometry. Do not only recolor the existing motorcycle part.`,
          `- Target area to edit: ${targetArea}`,
          `- Reference image: ${
            ref ? `[${ref.refKey}]` : 'No reference image provided'
          }`,
          `- Required result: Install this exact selected part onto the motorcycle. Match the part reference as closely as possible.`,
        ];

        if (
          detectedType.includes('brake') ||
          getPartSearchText(part).includes('disc') ||
          getPartSearchText(part).includes('rotor') ||
          getPartSearchText(part).includes('caliper')
        ) {
          details.push(
            `- Brake rotor hard requirement: This is a brake rotor replacement, not a wheel/rim/mags replacement.`,
            `- Brake rotor hard requirement: Visibly replace the original rotor design on the wheel hub.`,
            `- Brake rotor hard requirement: The final rotor must show the reference rotor's outer shape, wave/petal edge if present, drilled hole pattern, inner carrier shape, color, and finish.`,
            `- Brake rotor hard requirement: Do not leave the stock rotor unchanged. Do not only recolor, sharpen, or preserve the existing rotor.`,
            `- Brake rotor placement: Keep the rotor centered on the wheel hub, aligned with the axle, fork, and brake caliper, and behind/in the correct layer relative to the caliper.`,
            `- Brake rotor preservation: Preserve the rim/mags/spokes, tire, caliper, fork, axle, body color, decals, lighting, camera angle, crop, and background.`
          );
        }

        if (
          detectedType.includes('exhaust') ||
          getPartSearchText(part).includes('muffler') ||
          getPartSearchText(part).includes('pipe')
        ) {
          details.push(
            `- Exhaust hard requirement: This exhaust must be installed on the motorcycle, not displayed as a detached product.`,
            `- Exhaust hard requirement: Attach it to the scooter's existing exhaust mounting path near the engine and rear wheel.`,
            `- Exhaust hard requirement: Do not place the exhaust below, beside, or outside the motorcycle.`,
            `- Exhaust hard requirement: Do not copy the reference image background, shadow, label, packaging, or full product cutout into the result.`,
            `- Exhaust preservation: Preserve the body color, decals, panels, wheel, tire, brake rotor, seat, lighting, camera angle, crop, and background.`
          );
        }

        if (
          detectedType.includes('radiator') ||
          getPartSearchText(part).includes('radiator') ||
          getPartSearchText(part).includes('cooler') ||
          getPartSearchText(part).includes('cooling')
        ) {
          details.push(
            `- Radiator hard requirement: This radiator must be installed in the visible cooling/radiator mounting area, not displayed as a detached product.`,
            `- Radiator hard requirement: Do not place the radiator on the wheel, tire, fender, fork, ground, or blank background.`,
            `- Radiator hard requirement: If the exact radiator bay is not visible, show only a realistic partial radiator core behind an existing vent/opening instead of pasting the full product image.`,
            `- Radiator placement: Keep it small, recessed, aligned with the scooter frame, and naturally occluded by nearby panels if needed.`,
            `- Radiator preservation: Preserve the wheel, tire, brake rotor, caliper, fork, body color, decals, panels, seat, lighting, camera angle, crop, and background.`
          );
        }

        if (
          detectedType.includes('suspension') ||
          getPartSearchText(part).includes('shock') ||
          getPartSearchText(part).includes('absorber')
        ) {
          details.push(
            `- Suspension hard requirement: This is a replacement of the existing rear shock, not an additional second shock.`,
            `- Suspension hard requirement: Find the currently visible rear shock absorber and transform that same shock into the reference shock.`,
            `- Suspension hard requirement: The coil spring must change to match the reference image. Do not leave the original spring unchanged.`,
            `- Suspension hard requirement: If the reference shock has a gold/yellow spring, the final visible spring must be gold/yellow.`,
            `- Suspension hard requirement: Changing only the reservoir/cup/top hardware is not enough and is considered wrong.`,
            `- Suspension hard requirement: Do not add a duplicate shock, extra spring, auxiliary shock, extra reservoir, or extra mounting bracket.`,
            `- Suspension hard requirement: The old original shock must not remain visible beside the new one.`,
            `- Suspension placement: Keep the shock attached to the same original upper and lower mounting points between the frame and swingarm/rear wheel area.`,
            `- Suspension preservation: Preserve the frame, body panels, wheel, tire, exhaust, lighting, camera angle, crop, and background.`
          );
        }

if (isWheelPart(part)) {
          details.push(
            `- Wheel/rim hard requirement: Replace ONLY the rim/mags/spoke structure inside the existing tire.`,
            `- Wheel/rim hard requirement: Preserve the original tire, brake disc rotor, brake caliper, axle, fork, front fender, motorcycle body, lighting, camera angle, crop, and background.`,
            `- Wheel/rim layer order: The brake disc rotor and brake caliper must remain visible in front of the new rim. Do not cover them with the new mags.`,
            `- Wheel/rim rejection rule: Do not keep the original spoke pattern and simply change its color.`
          );

          if (requiredSpokeCount) {
            details.push(
              `- REQUIRED EXACT SPOKE COUNT: ${requiredSpokeCount}. The final rim must visibly have exactly ${requiredSpokeCount} main spokes. Do not add extra spokes. Do not use the original wheel's spoke pattern.`
            );
          }
        }

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

        if (!ref) {
          details.push(
            `- Important limitation: No reference image was provided for this part. Use the part name, type, and description, but still replace the physical part shape instead of only recoloring it.`
          );
        }

        return details.join('\n');
      })
      .join('\n\n');

    const prompt = `
You are editing one real motorcycle photo.

BASE PHOTO:
[BASE_IMAGE] is the original motorcycle photo and the locked base plate.
The final output must keep the same motorcycle, same body color, same decals, same lighting, same background, same camera angle, and same crop.
Only the selected part areas listed below may change.

MOTORCYCLE:
${motorcycleLabel || 'Customer motorcycle'}

PHOTO SOURCE:
${imageSource || 'unknown'}

BASE PHOTO SOURCE:
${basePhotoSource || 'photoUrl'}

BASE PHOTO CONTEXT:
${basePhotoContext || 'No extra base photo context provided.'}

PHOTO ACCURACY RULE:
If [BASE_IMAGE] is a full motorcycle side-view, perform a whole-bike localized part edit.
If [BASE_IMAGE] is a close-up of the installation location, do not zoom out or invent the rest of the motorcycle.
Treat the visible close-up area as the locked base photo and edit only the selected part's mounting area.
Use nearby bolts, brackets, mounting points, panels, wheel, fork, swingarm, exhaust, headlight housing, and surrounding parts as alignment guides.
Preserve every visible non-selected area in the close-up photo.

SELECTED PARTS TO INSTALL:
${partListText}

CORE INSTRUCTION:
This is a photo edit/inpainting task, not a new-image generation task.
Start from [BASE_IMAGE] and preserve it as much as possible.
Install each selected part onto the correct target area of the motorcycle in [BASE_IMAGE].
For suspension/shock parts, transform the existing visible shock, including the coil spring, instead of adding a second shock or only changing the reservoir/cup.
Use the matching reference image for each part as the exact visual source when a reference image is provided.
The selected part must become visible as a real installed motorcycle component, not as a color filter.
Do not replace [BASE_IMAGE] with a different stock motorcycle photo.
Do not paste, copy, display, or place any reference image as a separate product object.
Reference images are visual guides only. The final output must contain only the edited motorcycle photo.
Every selected part must be physically installed on the motorcycle at its correct mounting location.
No detached parts may appear below, beside, above, in front of, or behind the motorcycle.
No loose exhaust pipes, loose rotors, loose wheels, loose product photos, product cutouts, boxes, labels, or catalog objects may appear anywhere in the final image.
If a part cannot be realistically installed from the view, still do a subtle localized installed edit instead of placing the part as a separate object.

REFERENCE IMAGE USE RULE:
Reference images must never appear as separate visible objects in the output.
Use each reference image only to understand the selected part's design, shape, material, color, finish, and geometry.
Then redraw that part installed into the correct area of [BASE_IMAGE].
Do not copy the entire reference photo, reference background, product shadows, product cutout, packaging, watermark, or display angle into the output.

REFERENCE PRIORITY:
1. The reference image controls the final appearance.
2. The geometry description explains the reference image.
3. The shop description, color, material, and finish are additional constraints.
4. The part name and category explain where the part belongs.
5. Do not invent a different design if a reference image is provided.

MULTI-PART INSTALLATION RULE:
If multiple parts are selected, install each selected part onto the motorcycle only.
Do not show one installed part and another detached reference product.
Do not create a product display layout.
Do not place selected parts on the ground, in the blank background, or outside their mounting areas.
For exhaust parts, the pipe/muffler must attach to the scooter's exhaust mounting path under/side of the engine/rear wheel area.
For radiator parts, the radiator must be installed only inside/behind the visible cooling vent or radiator bay and never on the wheel/tire/fender/background.
For brake rotor parts, the rotor must stay centered on the wheel hub.
For suspension parts, transform the existing rear shock instead of adding a second shock.
For wheel/rim parts, the rim/spoke structure must stay inside the existing tire.

STRICT EDITING RULES:
- Edit only the selected part areas.
- Treat [BASE_IMAGE] as a locked base photo. Non-selected areas should remain visually identical to [BASE_IMAGE].
- The base motorcycle body paint is locked. Keep the exact original body color, decals, graphics, panels, seat color, tire color, wheel tire shape, lighting, shadows, camera angle, crop, and background from [BASE_IMAGE].
- Do not repaint, recolor, restyle, redesign, beautify, clean up, or replace the motorcycle body.
- Do not change black panels into gray, white, silver, blue, or any other color.
- Do not change blue/cyan accent decals into purple, red, gray, white, or any other color.
- Do not change decals, stickers, graphics, logos, or body accents unless a decal/sticker/body panel is one of the selected parts.
- Do not generate a different motorcycle, a different trim, a different colorway, or a cleaner studio/product-photo version.
- Reference part images affect ONLY the selected parts. They must not influence the motorcycle body color, panel style, decals, background, or lighting.
- Only the selected parts may change color, shape, material, or finish.
- Do not change the motorcycle model, body shape, body paint, background, lighting, camera angle, crop, or perspective.
- Do not change unrelated motorcycle parts.
- Do not add extra accessories, stickers, decals, lights, wheels, pipes, mirrors, or decorations that were not selected.
- Do not remove parts unless they are being replaced by the selected part.
- Match the reference part's actual shape, structure, silhouette, material, color, finish, and orientation.
- Do not only recolor the original part. If the selected part has a different shape, redraw the shape completely.
- The original selected area should be replaced by the chosen part design, not merely tinted.
- Keep the installed part realistic, properly scaled, aligned, mounted, and physically possible.
- If multiple parts are selected, install all selected parts at the same time, each in its own correct target area.
- If two selected parts are near each other, keep them visually separate and do not merge their shapes.

WHEEL/RIM SPOKE FIDELITY RULES:
- For wheel/rim/mags parts, the exact number of main spokes is more important than color.
- If the selected rim is described as 3-spoke, the final rim must show exactly 3 large main spokes spaced around the wheel.
- Do not create many thin spokes, split spokes, hidden extra spokes, or the original motorcycle's spoke pattern.
- Preserve the existing brake disc rotor and brake caliper as foreground parts over the new rim.

CATEGORY-SPECIFIC RULES:
${categoryRules}

BRAKE ROTOR VISIBILITY RULE:
If a selected part is a brake disc rotor, the output is wrong unless the stock rotor is visibly replaced with the selected rotor design.
The final rotor must visibly show the selected reference rotor's wave/petal shape if present, drilled hole pattern, silver/black areas if present, and correct centered placement on the wheel hub.
For brake disc rotor jobs, do not apply wheel/rim/mags replacement rules. Preserve the rim, spokes, tire, and wheel structure while replacing only the brake disc rotor.

SUSPENSION REPLACEMENT RULE:
If a selected part is a rear suspension/shock absorber, the output is wrong if the old original shock remains visible beside the new shock.
The model must replace/transform the existing visible shock, not add a second shock.
For a scooter view with one visible rear shock, show one installed rear shock only.
The visible coil spring must change to match the selected reference shock. If the reference has a gold/yellow spring, the final visible spring must be gold/yellow.
Changing only the reservoir/cup/cap/top hardware while leaving the old spring unchanged is wrong.

FAIL CONDITIONS:
The result is wrong if:
- the motorcycle body color, panel color, decals, graphics, logos, accent stripes, or base paint changes;
- the result uses a different motorcycle color than [BASE_IMAGE];
- the output looks like a different stock/product motorcycle photo instead of the uploaded/reference base photo;
- the output turns a black motorcycle into gray, silver, white, or blue;
- the original part is only recolored;
- the selected part shape does not match the reference image;
- the wrong part is installed in the wrong location;
- one selected part is ignored;
- two selected parts are mixed together;
- unrelated motorcycle parts are changed;
- a suspension/shock part is added as a second shock instead of replacing the existing visible shock;
- the old original shock remains visible beside the new reference shock;
- only the suspension reservoir/cup changes but the original coil spring remains unchanged;
- the selected Ohlins/gold shock does not show a visibly gold/yellow coil spring when the reference has one;
- the motorcycle becomes a different model;
- extra parts or decorations are added;
- a selected part appears as a detached loose product, separate product photo, product cutout, or object lying on the ground/background;
- an exhaust pipe appears below, beside, or outside the motorcycle instead of attached to the exhaust mounting area;
- a brake rotor appears as a sticker, floating object, or detached product instead of centered on the wheel hub;
- a radiator appears on top of the wheel, tire, fender, fork, ground, or blank background instead of inside/behind a real cooling opening;
- a radiator is pasted as a full rectangular product photo instead of installed/recessed into the motorcycle;
- the result becomes a drawing, render, cartoon, collage, or product mockup.

OUTPUT:
Return one realistic edited photograph only.
The output must be the same motorcycle photo with selected parts installed.
No detached product parts.
No loose exhaust pipe on the ground.
No loose brake rotor.
No loose radiator.
No radiator pasted over the wheel.
No second added shock.
No duplicate suspension.
No unchanged old suspension spring when replacing a shock.
No cup-only or reservoir-only suspension edit.
No copied reference product image.
No product display.
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
You are a careful professional motorcycle photo editor doing localized edits only.
You must preserve the base motorcycle photo almost pixel-for-pixel outside selected part areas.
Never replace the motorcycle with a different stock photo, different colorway, different trim, or cleaner product image.
When asked to replace or install a part, you change the actual shape and structure to match the reference image, not just the color.
Reference part images affect only the selected part areas, never the body paint, decals, panels, background, lighting, camera angle, or crop.
You only edit the requested selected parts and leave all unrelated areas unchanged.
You must avoid mixing selected parts together.
Never paste or show reference images as separate products in the output.
Every selected part must be installed on the motorcycle, not displayed as a loose object.
For suspension parts, replace the existing rear shock instead of adding another shock. For suspension parts, the visible spring must be replaced too, not only the reservoir/cup.
Never place an exhaust pipe, rotor, radiator, wheel, or any selected part on the ground, below, beside, over the wheel, or outside the motorcycle.
The final result must look like the same real photograph with only the selected parts modified.
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

    if (!generatedImageBase64 && isShapeSensitiveJob) {
      const retry = await generate(
        `
Try again and return an image.

Important correction:
Do not recolor only.
Fully replace the selected part shape and structure with the matching reference image.
For wheels/rims, remove the original rim/spoke design and redraw the selected reference rim design with the exact main spoke count. If the selected rim is 3-spoke, output exactly 3 visible main spokes. Preserve the original tire, brake rotor, caliper, axle, fork, and fender.
For brake disc rotors, visibly replace the original stock rotor with the selected reference rotor design. Show the wave/petal outer shape if present, drilled hole pattern, inner carrier, color, and finish. Do not leave the stock rotor unchanged.
For exhaust parts, install the exhaust on the motorcycle at the correct exhaust mounting path. Do not show a detached exhaust product on the ground or in the background.
For radiator parts, install the radiator only inside/behind the visible cooling vent or radiator bay. Do not paste it on the wheel, tire, fender, fork, ground, or blank background. If the radiator bay is not visible, show only a subtle partial radiator core behind an existing opening.
For suspension parts, replace the existing rear shock with the reference shock. Do not add a second shock. The old original shock must not remain visible beside the new shock. The coil spring must change to match the reference spring color and shape. Do not change only the cup/reservoir/top hardware.
Do not paste any reference image as a separate object.
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

    return jsonResponse({
        success: true,
        imageUrl: dataUrl,
        prompt,
        debug: {
          basePhotoUrl: photoUrl,
          basePhotoSource: basePhotoSource || 'photoUrl',
          basePhotoContext: basePhotoContext || null,
          selectedParts: selectedParts.map((p) => ({
            id: p.id,
            name: p.name,
            category: p.category,
            detectedType: getDetectedPartType(p),
            hasImageUrl: Boolean(p.image_url),
            hasAiReferenceUrl: Boolean(p.ai_reference_url),
            referenceUrlType: p.ai_reference_url
              ? 'ai_reference_url'
              : p.image_url
              ? 'image_url'
              : null,
            hasUsableReference: Boolean(p.ai_reference_url || p.image_url),
            requiredSpokeCount: getRequiredSpokeCount(p),
            installArea: p.install_area,
          })),
          referenceImagesUsed: partRefs.map((r) => ({
            name: r.name,
            category: r.category,
            refKey: r.refKey,
            sourceType: r.sourceType,
            hasGeometrySpec: Boolean(r.geometrySpec),
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