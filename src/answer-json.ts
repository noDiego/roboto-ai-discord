import { AIAnswer } from './interfaces/ai-interfaces';
import logger from './logger';

/**
 * Pure JSON answer helpers extracted from `utils.ts` so the DeepSeek adapter
 * can be imported (and unit tested) without pulling in `config`/`roboto` and
 * their Discord/network side effects.
 */

export function extractJSON(input: string, botName: string): AIAnswer {
  // Remove <think> tags if they exist
  const cleanedInput = input?.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

  if (!cleanedInput || typeof cleanedInput !== 'string') {
    return null;
  }

  // Helper to fix common JSON string issues
  const fixJsonString = (jsonStr: string): string => {
    let fixed = '';
    let inString = false;
    let escapeNext = false;

    for (let i = 0; i < jsonStr.length; i++) {
      const char = jsonStr[i];

      if (escapeNext) {
        fixed += char;
        escapeNext = false;
        continue;
      }

      if (char === '\\') {
        fixed += char;
        escapeNext = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        fixed += char;
        continue;
      }

      if (inString) {
        // Escape problematic characters inside strings
        switch (char) {
          case '\n': fixed += '\\n'; break;
          case '\r': fixed += '\\r'; break;
          case '\t': fixed += '\\t'; break;
          case '\b': fixed += '\\b'; break;
          case '\f': fixed += '\\f'; break;
          default: fixed += char;
        }
      } else {
        fixed += char;
      }
    }

    return fixed;
  };

  // Helper to safely unescape nested JSON strings (for DeepSeek style responses)
  const unescapeNestedJson = (str: string): any => {
    try {
      // Handle multiple levels of JSON string escaping
      let unescaped = str;
      let attempts = 0;
      const maxAttempts = 3; // Prevent infinite loops

      while (attempts < maxAttempts) {
        try {
          const temp = JSON.parse(unescaped);
          if (typeof temp === 'string' && temp !== unescaped) {
            unescaped = temp;
            attempts++;
          } else {
            return temp; // Successfully parsed object
          }
        } catch {
          break;
        }
      }

      return JSON.parse(unescaped);
    } catch {
      return null;
    }
  };

  // Attempt 1: Direct JSON parsing
  try {
    const parsed = JSON.parse(fixJsonString(cleanedInput));
    if (parsed?.message !== undefined) {
      return parsed;
    }
  } catch (e) {
    logger.debug(`[extractAnswer] Direct JSON parsing failed: ${e.message}`);
  }

  // Attempt 2: Handle nested structure (DeepSeek style)
  try {
    const parsed = JSON.parse(fixJsonString(cleanedInput));

    // Check for nested structure like {content: {text: "escaped_json"}} or {content: "escaped_json"}
    if (parsed?.content) {
      const contentText = typeof parsed.content === 'string' ? parsed.content : parsed.content.text;

      if (typeof contentText === 'string') {
        const nestedResult = unescapeNestedJson(contentText);
        if (nestedResult?.message !== undefined) {
          logger.debug("[extractAnswer] Successfully parsed nested JSON structure");
          return nestedResult;
        }
      }
    }
  } catch (e) {
    logger.debug(`[extractAnswer] Nested structure parsing failed: ${e.message}`);
  }

  // Attempt 3: Extract JSON from mixed content using regex
  const jsonMatches = cleanedInput.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g);

  if (jsonMatches) {
    for (const match of jsonMatches) {
      try {
        const parsed = JSON.parse(fixJsonString(match));
        if (parsed?.message !== undefined) {
          logger.debug("[extractAnswer] Successfully parsed regex-extracted JSON");
          return parsed;
        }
      } catch {
        continue; // Try next match
      }
    }
  }

  // Attempt 4: Look for escaped JSON patterns
  const escapedJsonMatch = cleanedInput.match(/"([^"]*(?:\\.[^"]*)*)"/);
  if (escapedJsonMatch?.[1]) {
    try {
      const nestedResult = unescapeNestedJson(`"${escapedJsonMatch[1]}"`);
      if (nestedResult?.message !== undefined) {
        logger.debug("[extractAnswer] Successfully parsed escaped JSON pattern");
        return nestedResult;
      }
    } catch {
      // Continue to fallback
    }
  }

  // Fallback: Return as plain text
  logger.debug("[extractAnswer] All parsing attempts failed, returning as plain text");
  return {
    message: cleanedInput,
    author: botName,
    type: 'text'
  };
}

export function sanitizeLogImages(str: string) {
  return str.replace(/(data:image\/[a-zA-Z0-9+.-]+;base64,)[A-Za-z0-9+/=]+/g, '$1...');
}
