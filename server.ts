import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { createServer as createViteServer } from 'vite';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json());

// Lazy-initialized Gemini AI client
let aiClient: GoogleGenAI | null = null;
function getAIClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    hasApiKey: !!process.env.GEMINI_API_KEY,
    timestamp: new Date().toISOString(),
  });
});

// AI Chatbot endpoint for Pan-India sacred heritage, account info updates, and budget advice
app.post('/api/chat', async (req, res) => {
  try {
    const { message, history = [], profile, latLng, mode = 'maps' } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required' });
    }

    const currentProfile = profile || {
      displayName: 'Pilgrim',
      homeCity: 'India',
      travelStyle: 'Heritage Explorer',
      budget: {
        currency: '₹',
        totalBudget: 35000,
        spentAmount: 11400,
        tripDurationDays: 6,
        categories: {
          transport: 8000,
          stay: 14000,
          activities: 5000,
          food: 6000,
          contingency: 2000,
        },
      },
    };

    const currency = currentProfile.budget?.currency || '₹';
    const totalBudget = Number(currentProfile.budget?.totalBudget) || 35000;
    const spentAmount = Number(currentProfile.budget?.spentAmount) || 0;
    const remaining = totalBudget - spentAmount;
    const isOverspent = spentAmount > totalBudget;
    const overspentDeficit = spentAmount - totalBudget;

    // Rich system prompt with Web Access & Google Maps Integration
    const systemInstruction = `You are "WAYRA AI Concierge & Financial Advisor" for the WAYRA Pan-Bharat sacred heritage travel application.
The app covers sacred heritage monuments across ALL INDIA (including Shree Ram Janmabhoomi Mandir in Ayodhya, Mount Kailash & Lake Mansarovar, Kashi Vishwanath in Varanasi, Kedarnath Dham, Golden Temple in Amritsar, Kailasa Temple at Ellora, Meenakshi Amman in Madurai, Virupaksha & Hampi, Somnath Jyotirlinga, Konark Sun Temple, Shree Jagannath Puri, and more).

Current User Information:
- Name: ${currentProfile.displayName || currentProfile.username || 'Traveler'}
- Home City: ${currentProfile.homeCity || 'Not specified'}
- Travel Style: ${currentProfile.travelStyle || 'Heritage Explorer'}
- Total Budget: ${currency}${totalBudget.toLocaleString()}
- Spent So Far: ${currency}${spentAmount.toLocaleString()}
- Current Balance: ${remaining >= 0 ? `${currency}${remaining.toLocaleString()} remaining` : `DEFICIT of ${currency}${Math.abs(remaining).toLocaleString()} (OVERSPENT)`}
- Current Category Allocations: Stay: ${currency}${currentProfile.budget?.categories?.stay || 0}, Transport: ${currency}${currentProfile.budget?.categories?.transport || 0}, Activities: ${currency}${currentProfile.budget?.categories?.activities || 0}, Food: ${currency}${currentProfile.budget?.categories?.food || 0}

CORE CAPABILITIES & WEB ACCESS:
1. LIVE GOOGLE MAPS & NAVIGATION WEB ACCESS:
   You have live Google Maps grounding and search access.
   For any landmark, temple, ashram, railway station, or route the user asks about, YOU MUST ALWAYS provide direct, formatted Google Maps web links so the user can open routes and satellite view directly:
   - Search/View link: [🗺️ View on Google Maps](https://www.google.com/maps/search/?api=1&query=ENCODED_LOCATION_NAME)
   - Route/Directions link: [🧭 Open Google Maps Navigation](https://www.google.com/maps/dir/?api=1&destination=ENCODED_LOCATION_NAME)
   Replace ENCODED_LOCATION_NAME with the URL-encoded name (e.g. Shree+Ram+Janmabhoomi+Mandir+Ayodhya).

2. PAN-INDIA SACRED HERITAGE EXPERTISE:
   Provide deep cultural, historical, architectural, and pilgrimage guidance across India. Mention best seasons, temple dress codes, darshan rituals, and travel advice.

3. OVERSPENDING & BUDGET CRISIS ASSISTANCE (CRITICAL):
   If the user mentions they spent more than suggested/budgeted, OR if spentAmount > totalBudget (${isOverspent ? 'CURRENTLY OVERSPENT BY ' + currency + overspentDeficit : 'currently within budget'}), deliver a proactive, compassionate 4-Step Recovery Plan:
   - Step 1: Immediate Expense Freeze — Halt booking private cabs and luxury hotels.
   - Step 2: Sacred Hospitality Transition — Shift to sacred temple Dharamsalas, Ashrams, and Yatri Niwas (typically ₹200–₹500/night or donation-based, saving 70-85% on lodging).
   - Step 3: Sacred Culinary Economy — Partake in temple Annadanam and Gurudwara Langars (pure, delicious, blessed free/subsidized community meals like Puri Mahaprasad, Golden Temple Langar, Ayodhya Ram Mandir Prasad).
   - Step 4: Budget Updation & Recalibration — Calculate a revised realistic total budget ceiling and reallocate category limits.

4. STRUCTURED ACTIONS (VERY IMPORTANT):
   When the user asks to update their budget, or when you suggest a budget recovery/increase, append this exact machine-readable tag on its own line:
   ACTION:UPDATE_BUDGET:{"totalBudget":<newNumber>,"spentAmount":<number>,"categories":{"transport":<number>,"stay":<number>,"activities":<number>,"food":<number>,"contingency":<number>}}

   When the user asks to update their profile/account info, append this exact machine-readable tag on its own line:
   ACTION:UPDATE_PROFILE:{"displayName":"<newName>","homeCity":"<newCity>","travelStyle":"<newStyle>","bio":"<newBio>"}

Always be encouraging, culturally reverent, practical, and precise. Format responses with clear headings, bullet points, and Google Maps links.`;

    function generateFallbackResponse() {
      let reply = '';
      const lowerMsg = message.toLowerCase();

      // Check for overspending or budget questions or explicit budget numbers
      if (
        lowerMsg.includes('overspent') ||
        lowerMsg.includes('spent more') ||
        lowerMsg.includes('exceeded') ||
        lowerMsg.includes('budget') ||
        lowerMsg.includes('deficit') ||
        isOverspent
      ) {
        const numMatch = lowerMsg.match(/(?:to|of|is)\s*(?:₹|rs\.?|inr)?\s*(\d[\d,]*)/i);
        const requestedTotal = numMatch ? parseInt(numMatch[1].replace(/,/g, '')) : null;
        const adjustedTotal = requestedTotal || Math.max(spentAmount + 10000, totalBudget + 15000);

        reply = `### ⚠️ Sacred Financial Recovery Plan: What To Do Next\n\n` +
          `You have spent **${currency}${spentAmount.toLocaleString()}** against your planned budget ceiling of **${currency}${totalBudget.toLocaleString()}**` +
          `${spentAmount > totalBudget ? ` — resulting in an active deficit of **${currency}${(spentAmount - totalBudget).toLocaleString()}**` : ` (utilizing ${Math.round((spentAmount / totalBudget) * 100)}% of your allowance)`}.\n\n` +
          `Here is your immediate 4-pillar roadmap to balance your pilgrimage without losing the sacred experience:\n\n` +
          `1. **Transition to Temple Ashrams & Dharamsalas**:\n` +
          `   - Discontinue commercial hotels. Shift to temple trust Yatri Niwas and dharamsalas (₹250–₹600/night).\n\n` +
          `2. **Partake in Sacred Annadanam & Langar**:\n` +
          `   - Eat nutritious, blessed meals at temple Annadanam halls (e.g. Ram Mandir Prasad halls, Golden Temple Guru Ka Langar, Puri Ananda Bazar Mahaprasad).\n\n` +
          `3. **Indian Railways Transit & Shared E-Autos**:\n` +
          `   - Substitute private cabs with Vande Bharat/sleeper trains, and use shared electric rickshaws for local temple corridors.\n\n` +
          `4. **Zero-Cost Spiritual Immersions**:\n` +
          `   - Focus on open river ghat evening aartis (Ram Ki Paidi in Ayodhya, Dashashwamedh in Kashi), temple complex parikramas, and public heritage monuments.\n\n` +
          `We have recalibrated a safe budget ceiling of **${currency}${adjustedTotal.toLocaleString()}** with balanced categories:\n\n` +
          `ACTION:UPDATE_BUDGET:{"totalBudget":${adjustedTotal},"spentAmount":${spentAmount},"categories":{"transport":${Math.round(adjustedTotal * 0.25)},"stay":${Math.round(adjustedTotal * 0.35)},"activities":${Math.round(adjustedTotal * 0.15)},"food":${Math.round(adjustedTotal * 0.15)},"contingency":${Math.round(adjustedTotal * 0.1)}}}\n`;
      } else if (lowerMsg.includes('ram') || lowerMsg.includes('sriram') || lowerMsg.includes('ayodhya')) {
        reply = `### 🛕 Shree Ram Janmabhoomi Mandir, Ayodhya\n\n` +
          `The grand **Shree Ram Janmabhoomi Mandir** is an architectural masterpiece rendered in classical Nagara style using hand-carved pink Bansi Paharpur sandstone from Rajasthan without iron or steel.\n\n` +
          `- **Key Highlights**: 3-storied sanctum rising 161 feet high, 392 intricately carved pillars, and 44 teakwood doors adorned with golden iconography.\n` +
          `- **Best Timings**: October to March; early morning Mangala Aarti (6:30 AM) and evening Shringar Aarti (7:00 PM).\n` +
          `- **Sacred Corridor**: Pair your darshan with Hanumangarhi Temple, Kanak Bhawan, and evening Sarayu River Maha Aarti at Ram Ki Paidi.\n` +
          `- **Google Maps Live Navigation**:\n` +
          `  - [🗺️ View Shree Ram Mandir on Google Maps](https://www.google.com/maps/search/?api=1&query=Shree+Ram+Janmabhoomi+Mandir+Ayodhya)\n` +
          `  - [🧭 Get Live Directions to Ayodhya Dham](https://www.google.com/maps/dir/?api=1&destination=Shree+Ram+Janmabhoomi+Mandir+Ayodhya)\n\n` +
          `- **Logistics & Dress**: Darshan is free; book Sugam Darshan passes on the official trust portal for expedited queues. Modest traditional attire is recommended.`;
      } else if (lowerMsg.includes('kailash') || lowerMsg.includes('mansarovar')) {
        reply = `### 🏔️ Sacred Mount Kailash (6,638m) & Lake Mansarovar\n\n` +
          `Revered across Hinduism, Buddhism, Jainism, and Bon as Mount Meru and the Axis Mundi—the physical and spiritual center of the cosmos.\n\n` +
          `- **The Kailash Kora (Parikrama)**: A grueling 52-kilometer circumambulation over 3 days, crossing the formidable Dolma La Pass at 5,630 meters (18,471 ft).\n` +
          `- **Lake Mansarovar**: The highest freshwater body on Earth at 4,590m, famed for its crystal turquoise waters reflecting snow peaks.\n` +
          `- **Google Maps Live Navigation**:\n` +
          `  - [🗺️ View Mount Kailash on Google Maps Satellite](https://www.google.com/maps/search/?api=1&query=Mount+Kailash+Tibet)\n` +
          `  - [🗺️ View Lake Mansarovar on Google Maps](https://www.google.com/maps/search/?api=1&query=Lake+Mansarovar)\n\n` +
          `- **Preparation**: Prioritize cardiovascular fitness, mandatory acclimatization in high valleys, and sub-zero thermal mountaineering gear.`;
      } else if (lowerMsg.includes('map') || lowerMsg.includes('direction') || lowerMsg.includes('route') || lowerMsg.includes('navigate')) {
        const queryTerm = encodeURIComponent(message.replace(/map|direction|route|where|navigate|google/gi, '').trim() || 'Kashi Vishwanath Varanasi');
        reply = `### 🗺️ Live Google Maps & Route Navigation\n\n` +
          `Here is real-time web navigation access for your destination:\n\n` +
          `- [🗺️ Open Destination on Google Maps](https://www.google.com/maps/search/?api=1&query=${queryTerm})\n` +
          `- [🧭 Get Step-by-Step Directions on Google Maps](https://www.google.com/maps/dir/?api=1&destination=${queryTerm})\n\n` +
          `Tip: You can also manage your **Offline Maps & GPS navigation modes** in the **Account** tab without needing cellular reception!`;
      } else if (lowerMsg.includes('profile') || lowerMsg.includes('name') || lowerMsg.includes('city') || lowerMsg.includes('style') || lowerMsg.includes('bio')) {
        let newCity = currentProfile.homeCity;
        if (lowerMsg.includes('ayodhya')) newCity = 'Ayodhya, Uttar Pradesh';
        else if (lowerMsg.includes('varanasi') || lowerMsg.includes('kashi')) newCity = 'Varanasi, Uttar Pradesh';
        else if (lowerMsg.includes('delhi')) newCity = 'New Delhi';
        else if (lowerMsg.includes('mumbai')) newCity = 'Mumbai, Maharashtra';

        let newStyle = currentProfile.travelStyle;
        if (lowerMsg.includes('pilgrim')) newStyle = 'Spiritual Pilgrim';
        else if (lowerMsg.includes('heritage') || lowerMsg.includes('history')) newStyle = 'Heritage Connoisseur';
        else if (lowerMsg.includes('budget') || lowerMsg.includes('backpacker')) newStyle = 'Budget Yatri';

        reply = `I have drafted an update to your account details:\n\n` +
          `- **Home City**: ${newCity}\n` +
          `- **Travel Style**: ${newStyle}\n` +
          `- **Bio**: Dedicated pilgrim exploring sacred heritage, ancient temples, and mountain sanctuaries across Bharat.\n\n` +
          `ACTION:UPDATE_PROFILE:{"displayName":"${currentProfile.displayName}","homeCity":"${newCity}","travelStyle":"${newStyle}","bio":"Dedicated pilgrim exploring sacred heritage, ancient temples, and mountain sanctuaries across Bharat."}\n\n` +
          `Tap the action button below to instantly save these updates to your account!`;
      } else {
        reply = `Namaste! I am your **WAYRA AI Concierge & Financial Advisor**.\n\n` +
          `I am powered by **Google Gemini with Live Web Access & Google Maps**.\n\n` +
          `I can guide you across India's sacred monuments—from **Shree Ram Janmabhoomi Mandir** in Ayodhya and **Mount Kailash & Mansarovar**, to **Kashi Vishwanath**, **Kedarnath Dham**, **Puri Jagannath**, **Konark Sun Temple**, **Golden Temple**, and **Kailasa Temple at Ellora**.\n\n` +
          `I am equipped with:\n` +
          `- **🗺️ Google Maps Live Web Routes**: Instant links to directions, satellite views, and routes.\n` +
          `- **💰 Budget Updation & Overspending Recovery**: Actionable steps if you have spent more than suggested.\n` +
          `- **👤 Account Info Management**: Update your name, home city, or travel persona.\n` +
          `- **🛕 Pilgrimage Logistics**: Best seasons, dharamsalas, and darshan tips.\n\n` +
          `What can I help you explore or balance today?`;
      }

      return reply;
    }

    const ai = getAIClient();

    if (!ai) {
      return res.json({ response: generateFallbackResponse(), webSources: [] });
    }

    // Prepare multi-turn chat contents
    const formattedContents = [
      ...history.map((h: { role: string; content: string }) => ({
        role: h.role === 'user' ? 'user' : 'model',
        parts: [{ text: h.content }],
      })),
      {
        role: 'user',
        parts: [{ text: message }],
      },
    ];

    // Helper to extract web/maps sources
    const extractSources = (candidate: any) => {
      const chunks = candidate?.groundingMetadata?.groundingChunks || [];
      const sources: Array<{ title: string; uri: string; type: 'map' | 'web'; snippet?: string }> = [];
      for (const chunk of chunks) {
        if (chunk.maps?.uri) {
          sources.push({
            title: chunk.maps.title || 'Google Maps',
            uri: chunk.maps.uri,
            type: 'map',
            snippet: chunk.maps.placeAnswerSources?.reviewSnippets?.[0]?.snippet || undefined,
          });
        }
        if (chunk.web?.uri) {
          sources.push({
            title: chunk.web.title || 'Source',
            uri: chunk.web.uri,
            type: 'web',
          });
        }
      }
      return sources;
    };

    // Determine model and tools based on mode
    let targetModel = 'gemini-3.8-flash';
    let tools: any[] | undefined = undefined;
    let toolConfig: any = undefined;

    if (mode === 'fast') {
      targetModel = 'gemini-3.1-flash-lite';
    } else if (mode === 'search') {
      targetModel = 'gemini-3.8-flash';
      tools = [{ googleSearch: {} }];
    } else {
      // Default / 'maps' mode
      targetModel = 'gemini-3.8-flash';
      tools = [{ googleMaps: {} }];
      if (latLng && typeof latLng.latitude === 'number' && typeof latLng.longitude === 'number') {
        toolConfig = {
          retrievalConfig: {
            latLng: {
              latitude: latLng.latitude,
              longitude: latLng.longitude,
            },
          },
        };
      }
    }

    try {
      const configObj: any = {
        systemInstruction: {
          parts: [{ text: systemInstruction }],
        },
        temperature: 0.7,
      };
      if (tools) configObj.tools = tools;
      if (toolConfig) configObj.toolConfig = toolConfig;

      const response = await ai.models.generateContent({
        model: targetModel,
        contents: formattedContents,
        config: configObj,
      });

      const replyText = response.text || generateFallbackResponse();
      const webSources = extractSources(response.candidates?.[0]);

      return res.json({
        response: replyText,
        webSources,
        model: targetModel,
      });
    } catch (toolError: any) {
      console.warn(`Primary Gemini call (${targetModel} with ${mode}) failed, retrying with search grounding or base model:`, toolError?.message);
      
      // Fallback: Try gemini-3.8-flash with googleSearch or plain text
      try {
        const fallbackRes = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: formattedContents,
          config: {
            systemInstruction: {
              parts: [{ text: systemInstruction }],
            },
            tools: [{ googleSearch: {} }],
            temperature: 0.7,
          },
        });
        const replyText = fallbackRes.text || generateFallbackResponse();
        const webSources = extractSources(fallbackRes.candidates?.[0]);
        return res.json({
          response: replyText,
          webSources,
          model: 'gemini-3.8-flash',
        });
      } catch (fallbackErr: any) {
        console.warn('Fallback Gemini call also failed, serving rich local template response:', fallbackErr?.message);
        return res.json({
          response: generateFallbackResponse(),
          webSources: [],
          model: 'local-fallback',
        });
      }
    }
  } catch (error: any) {
    console.error('Error in /api/chat:', error);
    return res.status(500).json({
      error: 'Failed to process AI request',
      message: error?.message || 'Unknown server error',
    });
  }
});

// Vite middleware for development; static files for production
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Bharat Sacred Horizons Server running on port ${PORT}`);
  });
}

startServer();
