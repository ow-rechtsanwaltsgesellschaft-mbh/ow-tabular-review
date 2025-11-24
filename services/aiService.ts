import { DocumentFile, ExtractionCell, Column, ExtractionResult } from "../types";

// Initialize OpenAI-compatible API Client
const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
const apiBaseUrl = import.meta.env.VITE_OPENAI_API_BASE_URL || "https://api.openai.com/v1";

if (!apiKey) {
  console.error("VITE_OPENAI_API_KEY is not set in environment variables");
}

// Helper for delay
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Generic retry wrapper
async function withRetry<T>(operation: () => Promise<T>, retries = 5, initialDelay = 1000): Promise<T> {
  let currentTry = 0;
  while (true) {
    try {
      return await operation();
    } catch (error: any) {
      currentTry++;
      
      // Check for Rate Limit / Quota errors
      const isRateLimit = 
        error?.status === 429 || 
        error?.statusCode === 429 ||
        error?.code === 429 ||
        error?.message?.includes('429') || 
        error?.message?.includes('rate_limit') ||
        error?.message?.includes('quota');

      if (isRateLimit && currentTry <= retries) {
        // Exponential backoff with jitter to prevent thundering herd
        const delay = initialDelay * Math.pow(2, currentTry - 1) + (Math.random() * 1000);
        console.warn(`API Rate Limit hit. Retrying attempt ${currentTry} in ${delay.toFixed(0)}ms...`);
        await wait(delay);
        continue;
      }
      
      // If not a rate limit or retries exhausted, throw
      throw error;
    }
  }
}

// OpenAI-compatible API call
async function callOpenAIAPI(
  model: string,
  messages: Array<{ role: string; content: string }>,
  options?: {
    response_format?: { type: string };
    temperature?: number;
  }
): Promise<string> {
  if (!apiKey) {
    throw new Error("VITE_OPENAI_API_KEY is not set. Please configure your API key in the environment variables.");
  }

  const requestBody: any = {
    model: model,
    messages: messages,
    temperature: options?.temperature || 0.7,
  };

  // Only add response_format if specified (for JSON mode)
  if (options?.response_format) {
    requestBody.response_format = options.response_format;
  }

  console.log("Making API call to:", `${apiBaseUrl}/chat/completions`, { model, messagesCount: messages.length });
  
  const response = await fetch(`${apiBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const error: any = new Error(errorData.error?.message || `API request failed: ${response.statusText}`);
    error.status = response.status;
    error.statusCode = response.status;
    throw error;
  }

  const data = await response.json();
  console.log("API response data:", data);
  const content = data.choices[0]?.message?.content || "";
  console.log("Extracted content:", content?.substring(0, 200));
  return content;
}

// Schema for Extraction (OpenAI JSON mode)
const extractionSchema = {
  type: "object",
  properties: {
    value: {
      type: "string",
      description: "The extracted answer. Keep it concise.",
    },
    confidence: {
      type: "string",
      enum: ["High", "Medium", "Low"],
      description: "Confidence level of the extraction.",
    },
    quote: {
      type: "string",
      description: "Verbatim text from the document supporting the answer. Must be exact substring.",
    },
    page: {
      type: "integer",
      description: "The page number where the information was found (approximate if not explicit).",
    },
    reasoning: {
      type: "string",
      description: "A short explanation of why this value was selected.",
    },
  },
  required: ["value", "confidence", "quote", "reasoning"],
};

export const extractColumnData = async (
  doc: DocumentFile,
  column: Column,
  modelId: string
): Promise<ExtractionCell> => {
  console.log("extractColumnData called", { doc: doc.name, column: column.name, model: modelId });
  return withRetry(async () => {
    try {
      console.log("Starting extraction for", doc.name, column.name);
      // Decode Base64 to get the text
      let docText = "";
      try {
          docText = decodeURIComponent(escape(atob(doc.content)));
      } catch (e) {
          // Fallback
          docText = atob(doc.content);
      }

      // Format instruction based on column type
      let formatInstruction = "";
      switch (column.type) {
        case 'date':
            formatInstruction = "Format the date as YYYY-MM-DD.";
            break;
        case 'boolean':
            formatInstruction = "Return 'true' or 'false' as the value string.";
            break;
        case 'number':
            formatInstruction = "Return a clean number string, removing currency symbols if needed.";
            break;
        case 'list':
            formatInstruction = "Return the items as a comma-separated string.";
            break;
        default:
            formatInstruction = "Keep the text concise.";
      }

      const prompt = `Task: Extract specific information from the provided document.

Column Name: "${column.name}"
Extraction Instruction: ${column.prompt}

Format Requirements:
- ${formatInstruction}
- Provide a confidence score (High/Medium/Low).
- Include the exact quote from the text where the answer is found.
- Provide a brief reasoning.`;

      const messages = [
        {
          role: "system",
          content: "You are a precise data extraction agent. You must extract data exactly as requested. Always respond with valid JSON matching the required schema."
        },
        {
          role: "user",
          content: `DOCUMENT CONTENT:\n${docText}\n\n${prompt}`
        }
      ];

      const responseText = await callOpenAIAPI(modelId, messages, {
        response_format: { type: "json_object" },
        temperature: 0.3,
      });

      console.log("API response received:", responseText?.substring(0, 200));

      if (!responseText) {
          throw new Error("Empty response from model");
      }

      let json;
      try {
        json = JSON.parse(responseText);
        console.log("Parsed JSON:", json);
      } catch (parseError) {
        console.error("Failed to parse JSON response:", responseText);
        throw new Error(`Invalid JSON response: ${parseError}`);
      }

      // Handle different response formats
      // Format 1: Direct format { value, confidence, quote, page, reasoning }
      // Format 2: Nested format { "ColumnName": [{ value, confidence, quote, reasoning }] }
      // Format 3: Nested format { "ColumnName": "value", confidence, quote, reasoning } - value directly under column name
      // Format 4: Nested format { "ColumnName": ["string1", "string2", ...], confidence, quote, reasoning } - array of strings
      // Format 5: Array format [{ value, confidence, quote, reasoning }]
      
      let extractedData: any = null;
      let extractedValue: string = "";
      
      // Check if it's a direct format with "value" key
      if (json.value !== undefined) {
        extractedData = json;
        extractedValue = String(json.value);
      }
      // Check if it's a nested format with column name as key
      else if (typeof json === 'object' && Object.keys(json).length > 0) {
        const firstKey = Object.keys(json)[0];
        const firstValue = json[firstKey];
        
        // If the value is an array
        if (Array.isArray(firstValue) && firstValue.length > 0) {
          // Check if array contains strings (like ["item1", "item2"])
          if (typeof firstValue[0] === 'string') {
            // Join array of strings with newlines or commas
            extractedValue = firstValue.join('\n');
            // Use the rest of the json object for other fields
            extractedData = {
              value: extractedValue,
              confidence: json.confidence,
              quote: json.quote,
              page: json.page,
              reasoning: json.reasoning
            };
          }
          // If array contains objects (like [{ value, confidence, ... }])
          else if (typeof firstValue[0] === 'object' && firstValue[0] !== null) {
            extractedData = firstValue[0];
            extractedValue = String(extractedData.value || "");
          }
        }
        // If the value is a string (direct value under column name)
        else if (typeof firstValue === 'string') {
          extractedValue = firstValue;
          // Use the rest of the json object for other fields
          extractedData = {
            value: extractedValue,
            confidence: json.confidence,
            quote: json.quote,
            page: json.page,
            reasoning: json.reasoning
          };
        }
        // If the value is an object, use it directly
        else if (typeof firstValue === 'object' && firstValue !== null) {
          extractedData = firstValue;
          extractedValue = String(extractedData.value || "");
        }
      }
      // Check if it's an array format
      else if (Array.isArray(json) && json.length > 0) {
        // Check if array contains strings
        if (typeof json[0] === 'string') {
          extractedValue = json.join('\n');
          extractedData = {
            value: extractedValue,
            confidence: json.confidence || "Low",
            quote: json.quote || "",
            page: json.page || 1,
            reasoning: json.reasoning || ""
          };
        }
        // If array contains objects
        else {
          extractedData = json[0];
          extractedValue = String(extractedData.value || "");
        }
      }
      
      if (!extractedData && !extractedValue) {
        console.error("Could not extract data from response:", json);
        throw new Error("Unexpected response format from API");
      }

      // Extract metadata from either extractedData or top-level json object
      const finalValue = extractedValue || String(extractedData?.value || "");
      const finalConfidence = (extractedData?.confidence as any) || (typeof json === 'object' && !Array.isArray(json) ? json.confidence : undefined) || "Low";
      const finalQuote = extractedData?.quote || (typeof json === 'object' && !Array.isArray(json) ? json.quote : undefined) || "";
      const finalPage = extractedData?.page || (typeof json === 'object' && !Array.isArray(json) ? json.page : undefined) || 1;
      const finalReasoning = extractedData?.reasoning || (typeof json === 'object' && !Array.isArray(json) ? json.reasoning : undefined) || "";

      console.log("Final extraction result:", {
        value: finalValue,
        confidence: finalConfidence,
        quote: finalQuote.substring(0, 50),
        page: finalPage,
        reasoning: finalReasoning.substring(0, 50)
      });

      return {
        value: finalValue,
        confidence: finalConfidence,
        quote: finalQuote,
        page: finalPage,
        reasoning: finalReasoning,
        status: 'needs_review' as const
      };

    } catch (error) {
      console.error("Extraction error:", error);
      throw error;
    }
  });
};

export const generatePromptHelper = async (
    name: string,
    type: string,
    currentPrompt: string | undefined,
    modelId: string
): Promise<string> => {
    const prompt = `I need to configure a Large Language Model to extract a specific data field from business documents.
    
    Field Name: "${name}"
    Field Type: "${type}"
    ${currentPrompt ? `Draft Prompt: "${currentPrompt}"` : ""}
    
    Please write a clear, effective prompt that I can send to the LLM to get the best extraction results for this field. 
    The prompt should describe what to look for and how to handle edge cases if applicable.
    Return ONLY the prompt text, no conversational filler.`;

    try {
        const messages = [
          {
            role: "user",
            content: prompt
          }
        ];

        const responseText = await callOpenAIAPI(modelId, messages, {
          temperature: 0.7,
        });

        return responseText.trim() || "";
    } catch (error) {
        console.error("Prompt generation error:", error);
        return currentPrompt || `Extract the ${name} from the document.`;
    }
};

export const analyzeDataWithChat = async (
    message: string,
    context: { documents: DocumentFile[], columns: Column[], results: ExtractionResult },
    history: any[],
    modelId: string
): Promise<string> => {
    let dataContext = "CURRENT EXTRACTION DATA:\n";
    dataContext += `Documents: ${context.documents.map(d => d.name).join(", ")}\n`;
    dataContext += `Columns: ${context.columns.map(c => c.name).join(", ")}\n\n`;
    dataContext += "DATA TABLE (CSV Format):\n";
    
    const headers = ["Document Name", ...context.columns.map(c => c.name)].join(",");
    dataContext += headers + "\n";
    
    context.documents.forEach(doc => {
        const row = [doc.name];
        context.columns.forEach(col => {
            const cell = context.results[doc.id]?.[col.id];
            const val = cell ? cell.value.replace(/,/g, ' ') : "N/A";
            row.push(val);
        });
        dataContext += row.join(",") + "\n";
    });

    const systemInstruction = `You are an intelligent data analyst assistant. 
    You have access to a dataset extracted from documents (provided in context).
    
    User Query: ${message}
    
    ${dataContext}
    
    Instructions:
    1. Answer the user's question based strictly on the provided data table.
    2. If comparing documents, mention them by name.
    3. If the data is missing or N/A, state that clearly.
    4. Keep answers professional and concise.`;

    try {
        // Convert history format from Gemini to OpenAI format
        const openAIHistory = history.map((msg: any) => {
          if (msg.role === 'model') {
            return { role: 'assistant', content: msg.parts?.[0]?.text || msg.text || '' };
          }
          return { 
            role: msg.role === 'user' ? 'user' : 'assistant', 
            content: msg.parts?.[0]?.text || msg.text || '' 
          };
        });

        const messages = [
          {
            role: "system",
            content: systemInstruction
          },
          ...openAIHistory,
          {
            role: "user",
            content: message
          }
        ];

        const responseText = await callOpenAIAPI(modelId, messages, {
          temperature: 0.7,
        });

        return responseText || "No response generated.";
    } catch (error) {
        console.error("Chat analysis error:", error);
        return "I apologize, but I encountered an error while analyzing the data. Please try again.";
    }
};

