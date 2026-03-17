import { brandConfig } from "../config";
import { extractTextFromResponse } from "./geminiService";

export interface AssistantResponse {
    html: string;
}

export const generateAssistantResponse = async (
    prompt: string,
    history: { sender: 'user' | 'bot', text: string }[],
    images: string[] = []
): Promise<AssistantResponse> => {
    try {

        const systemPrompt = `
            You are an expert Healthco Health Assistant.
            Your role is to help customers find the perfect health plans and services for their specific lifestyles. Provide tailored, easy-to-understand insurance advice.

            **Guidelines:**
            - Always maintain a highly professional, consultative, and knowledgeable tone.
            - Provide clear, actionable advice.
            - If you use search tools, synthesize the information naturally into your response.

            **PRIORITY:**
            Your absolute priority is to assess, acknowledge, and respond directly to the USER'S LATEST MESSAGE provided at the end of the conversation history. Do not get sidetracked by previous context if the user has provided new specific instructions.

            **Core Capabilities:**
            1. **Plan Recommendations**: Suggest specific Healthco health plans, services, and benefits based on the user's goals.
            2. **Data Lookup**: Use Google Search to retrieve REAL-TIME data from Healthco's public databases (simulated) and EXTERNAL sources (health trends, regulatory news, competitor analysis).
            3. **Report Generation**: Create structured reports with "findings", "risks", and "recommendations".

            **Rules:**
            - **Grounding**: ALWAYS use Google Search when asked for current market trends, news, or specific factual data.
            - **Visuals**: Use HTML to format your response. Use Tailwind CSS classes for styling. Use brand colors: Primary: ${brandConfig.colors.primary}, Secondary: ${brandConfig.colors.secondary}.
            
            **Interactivity (CRITICAL):**
            - To create a button that the user can click to send a message to the chat, use:
              \`<button data-action="suggested-prompt" data-prompt="[USER_MESSAGE_TO_SEND]" class="assistant-btn">...</button>\`
            - To create a clickable "lookup" or highlighted term that sends a follow-up question to the chat, use:
              \`<span data-action="suggested-prompt" data-prompt="Tell me more about [TERM]" class="lookup-trigger">...</span>\`
            - ALWAYS use these attributes for suggested follow-up questions or data deep-dives.
        `;

        const responseSchema = {
            type: "object",
            properties: {
                type: { type: "string", enum: ["chat", "report", "data"] },
                html: { type: "string", description: "HTML content for the response. Use Tailwind CSS for styling." },
                title: { type: "string", description: "Title for the report or data table" },
                summary: { type: "string", description: "Executive summary for the report" },
                score: { type: "number", description: "Feasibility score (0-100)" },
                sections: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            title: { type: "string" },
                            content: { type: "string" }
                        },
                        required: ["title", "content"]
                    }
                },
                recommendation: { type: "string", description: "Produce / Kill / Pivot" },
                items: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            label: { type: "string" },
                            value: { type: "string" }
                        },
                        required: ["label", "value"]
                    }
                },
                references: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            text: { type: "string" },
                            url: { type: "string" }
                        },
                        required: ["text", "url"]
                    }
                }
            },
            required: ["type"]
        };

        // Structure contents with role-based messages
        const contents = history.map(msg => ({
            role: msg.sender === 'user' ? 'user' : 'model',
            parts: [{ text: msg.text }]
        }));

        // Add current prompt to contents
        const currentParts: any[] = [{ text: prompt }];
        if (images && images.length > 0) {
            images.forEach(img => {
                const cleanBase64 = img.split(',')[1] || img;
                currentParts.push({ inlineData: { mimeType: 'image/jpeg', data: cleanBase64 } });
            });
        }
        contents.push({ role: 'user', parts: currentParts });

        const genaiResponse = await fetch('/api/genai/generateContent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'gemini-3.1-flash-lite-preview',
                contents,
                systemInstruction: { parts: [{ text: systemPrompt }] },
                config: {
                    responseMimeType: "application/json",
                    responseSchema: responseSchema,
                    tools: [{ googleSearch: {} }]
                }
            })
        });
        
        if (!genaiResponse.ok) {
             throw new Error("Failed to generate assistant response from proxy");
        }
        
        const response = await genaiResponse.json();
        const text = extractTextFromResponse(response) || "{}";
        
        console.log("Assistant Raw Response:", text);

        const cleanText = text.replace(/```json|```/g, '').trim();
        let data: any;
        try {
            data = JSON.parse(cleanText);
            console.log("Assistant Parsed Data:", data);
        } catch (e) {
            console.error("Failed to parse Assistant JSON:", e);
            throw new Error("Invalid JSON response from Assistant");
        }

        // Convert JSON response to HTML for the UI
        let htmlContent = "";

        const renderReferences = (refs?: { text: string, url: string }[]) => {
            if (!refs || refs.length === 0) return '';
            return `
                <div class="mt-3 pt-3 border-t border-gray-100">
                    <p class="text-[10px] uppercase font-bold text-gray-400 mb-1">Sources</p>
                    <div class="flex flex-wrap gap-2">
                        ${refs.map(ref => `
                            <a href="${ref.url}" target="_blank" rel="noopener noreferrer" 
                               class="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 px-2 py-1 rounded-md transition-colors flex items-center gap-1">
                                🌐 ${ref.text}
                            </a>
                        `).join('')}
                    </div>
                </div>
            `;
        };

        // Default to 'chat' if type is missing but html/content exists
        if (!data.type) {
            if (data.html || data.content || data.answer || data.text) {
                data.type = 'chat';
                data.html = data.html || data.content || data.answer || data.text;
            }
        }

        if (data.type === 'chat') {
            htmlContent = `
                <div>
                    ${data.html}
                    ${renderReferences(data.references)}
                </div>
            `;
        } else if (data.type === 'report') {
            const scoreColor = data.score >= 80 ? 'text-green-600' : data.score >= 60 ? 'text-yellow-600' : 'text-red-600';
            htmlContent = `
                <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden font-sans">
                    <div class="bg-[${brandConfig.colors.primary}] p-4 text-white flex justify-between items-center">
                        <h3 class="font-bold text-lg">${data.title}</h3>
                        <div class="bg-white/20 px-3 py-1 rounded-full text-sm font-bold backdrop-blur-sm">Score: ${data.score}/100</div>
                    </div>
                    <div class="p-5 space-y-4">
                        <p class="text-gray-700 italic border-l-4 border-gray-200 pl-3">${data.summary}</p>
                        
                        <div class="grid gap-3">
                            ${data.sections.map((s: any) => `
                                <div class="bg-gray-50 p-3 rounded-lg border border-gray-100">
                                    <h4 class="font-bold text-[${brandConfig.colors.primary}] text-sm uppercase mb-1">${s.title}</h4>
                                    <p class="text-sm text-gray-800">${s.content}</p>
                                </div>
                            `).join('')}
                        </div>

                        <div class="mt-4 pt-4 border-t border-gray-100 flex justify-between items-center">
                            <span class="text-xs font-bold text-gray-500 uppercase">Recommendation</span>
                            <span class="font-bold text-lg ${data.recommendation === 'Produce' ? 'text-green-600' : 'text-gray-800'}">${data.recommendation}</span>
                        </div>
                        
                        ${renderReferences(data.references)}
                    </div>
                </div>
            `;
        } else if (data.type === 'data') {
            htmlContent = `
                <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4 font-sans">
                    <h3 class="font-bold text-[${brandConfig.colors.primary}] mb-3 border-b border-gray-100 pb-2">${data.title}</h3>
                    <div class="grid grid-cols-2 gap-4">
                        ${data.items.map((item: any) => `
                            <div>
                                <div class="text-xs text-gray-500 uppercase tracking-wide">${item.label}</div>
                                <div class="text-lg font-bold text-gray-900">${item.value}</div>
                            </div>
                        `).join('')}
                    </div>
                    ${renderReferences(data.references)}
                </div>
            `;
        } else {
            // Final fallback: just show the data as a stringified object if it's not empty
            console.warn("Unknown response format from Assistant:", data);
            htmlContent = `
                <div class="bg-gray-50 p-3 rounded-lg border border-gray-100 italic text-sm text-gray-600">
                    <p class="mb-2">I provided a response in a new format:</p>
                    ${data.html || JSON.stringify(data)}
                </div>
            `;
        }

        return { html: htmlContent };

    } catch (error) {
        console.error("Assistant generation error:", error);
        return { html: `<p class="text-red-600">Sorry, I encountered an error processing your request.</p>` };
    }
};
