import { GoogleGenAI, Type } from "@google/genai";
import { MoleculeResult } from "../types";

// Initialize Gemini client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const identifyMoleculeWithGemini = async (composition: Record<string, number>): Promise<MoleculeResult | null> => {
  try {
    const compString = Object.entries(composition)
      .map(([el, count]) => `${el}:${count}`)
      .join(', ');

    const prompt = `I have formed a stable molecule with the following atoms: ${compString}. 
    Identify this molecule. If it is a common stable molecule (like Water, Methane, Ammonia, CO2, HCl, H2S, PCl3, SO2, NaCl, CCl4, PH3), return its name, formula, and a short fun fact (max 15 words).
    If it's theoretically possible but obscure, or just a valid graph but not a common name, give it a generic name like "Hydrocarbon Chain" or "Sulfur Compound".
    Return JSON.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            formula: { type: Type.STRING },
            fact: { type: Type.STRING },
          },
          required: ['name', 'formula', 'fact']
        }
      }
    });

    const text = response.text;
    if (!text) return null;
    return JSON.parse(text) as MoleculeResult;

  } catch (error) {
    console.error("Gemini identification failed:", error);
    // Fallback for offline or error
    return {
      name: "Unknown Molecule",
      formula: "???",
      fact: "A mysterious bond formed in the void."
    };
  }
};

export const getLevelChallenge = async (difficulty: number): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Generate a short, motivational 1-sentence mission briefing for a chemistry game level (Difficulty ${difficulty}/5). Focus on bonding atoms like H, C, O, N, S, P, Cl.`,
    });
    return response.text || "Bond atoms to survive!";
  } catch (e) {
      return "Bond atoms together to create stable molecules!";
  }
};

export const getRecipeHint = async (availableAtoms: string[]): Promise<string> => {
  if (availableAtoms.length === 0) return "Wait for atoms to spawn!";
  
  try {
    const counts = availableAtoms.reduce((acc, type) => {
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `I have these atoms available: ${JSON.stringify(counts)}. Suggest ONE simple stable molecule formula I can build using a subset of these (e.g. H2O). Return ONLY the formula. If nothing obvious, return "Collect more atoms".`,
    });
    return response.text?.trim() || "Try connecting different atoms!";
  } catch (e) {
    return "Experiment with bonds!";
  }
};