import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { photoUrl, partNames, partDetails, motorcycleLabel, imageSource } = await req.json();

    if (!photoUrl || !partNames) {
      return new Response(
        JSON.stringify({ error: 'photoUrl and partNames are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch the photo and convert to base64
    const imageRes = await fetch(photoUrl);
    const imageBuffer = await imageRes.arrayBuffer();
    const base64Image = btoa(
      new Uint8Array(imageBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
    );
    const mimeType = imageRes.headers.get('content-type') || 'image/jpeg';

    // Determine part categories for specific instructions
    const partCategories = partDetails.map((p) => p.category?.toLowerCase() || '').join(', ');

    // Step 1: Use gemini-3.5-flash to describe the bike and generate edit instructions
    const describeRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `Describe this ${motorcycleLabel} motorcycle photo in extreme detail for an image generation prompt. Include: exact body color, shape, angle, background, lighting, wheel style, exhaust, seat, mirrors. Then at the end, describe what it would look like with ONLY these modifications applied: ${partNames} (category: ${partCategories}). Write it as a single cohesive image generation prompt. Be very specific that ONLY the ${partCategories} changes and everything else stays exactly the same.`
                },
                { inline_data: { mime_type: mimeType, data: base64Image } },
              ],
            },
          ],
        }),
      }
    );

    const describeData = await describeRes.json();
    const basePrompt = describeData.candidates?.[0]?.content?.parts?.[0]?.text ||
      `Photorealistic ${motorcycleLabel} motorcycle with ${partNames} installed, professional photography`;

    // Build specific instructions based on part category
    const specificInstructions = `
SPECIFIC INSTRUCTIONS BASED ON PART TYPE:
${partCategories.includes('wheel') || partCategories.includes('rim') ?
  '- ONLY change the WHEELS/RIMS. Replace both wheels with aftermarket sport rims with a different spoke pattern. Do NOT touch the exhaust, body, seat, mirrors, or any other part.' : ''}
${partCategories.includes('exhaust') || partCategories.includes('muffler') ?
  '- ONLY change the EXHAUST/MUFFLER pipe. Do NOT touch the wheels, body, seat, or any other part.' : ''}
${partCategories.includes('headlight') ?
  '- ONLY change the HEADLIGHT. Do NOT touch the wheels, exhaust, body, or any other part.' : ''}
${partCategories.includes('seat') ?
  '- ONLY change the SEAT. Do NOT touch the wheels, exhaust, headlight, or any other part.' : ''}
${partCategories.includes('mirror') ?
  '- ONLY change the SIDE MIRRORS. Do NOT touch any other part.' : ''}
${partCategories.includes('decal') || partCategories.includes('sticker') ?
  '- ONLY change the DECALS/STICKERS on the body. Do NOT touch wheels, exhaust, or any other part.' : ''}
${partCategories.includes('footpeg') ?
  '- ONLY change the FOOTPEGS. Do NOT touch any other part.' : ''}

STRICT RULES:
- Change ONLY the ${partCategories} mentioned above, nothing else.
- Keep motorcycle body, color, background, angle, and lighting IDENTICAL.
- The change must be clearly visible.
- Output must look like a real photograph.`;

    const detailedPrompt = basePrompt + specificInstructions;

    console.log('Generated prompt:', detailedPrompt);

    // Step 2: Use gemini-2.5-flash-image to generate the modified image
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: detailedPrompt },
                { inline_data: { mime_type: mimeType, data: base64Image } },
              ],
            },
          ],
          generationConfig: {
            responseModalities: ['IMAGE', 'TEXT'],
          },
        }),
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error('Gemini API error response:', errText);
      throw new Error(`Gemini API error (${geminiRes.status}): ${errText}`);
    }

    const geminiData = await geminiRes.json();

    const candidates = geminiData.candidates || [];
    let generatedImageBase64 = null;
    let generatedMimeType = 'image/png';

    for (const candidate of candidates) {
      for (const part of candidate.content?.parts || []) {
        if (part.inlineData) {
          generatedImageBase64 = part.inlineData.data;
          generatedMimeType = part.inlineData.mimeType || 'image/png';
          break;
        }
      }
      if (generatedImageBase64) break;
    }

    if (!generatedImageBase64) {
      throw new Error('No image returned from Gemini API.');
    }

    // Return base64 image directly — no storage upload needed
    const dataUrl = `data:${generatedMimeType};base64,${generatedImageBase64}`;

    return new Response(
      JSON.stringify({ imageUrl: dataUrl, prompt: detailedPrompt }),
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