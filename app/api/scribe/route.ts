import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import { z } from "zod";
import { zfd } from "zod-form-data";
import { LangObj } from "@/types/lang";

const groq = new Groq();

const schema = zfd.formData({
  text: z.string(),
  config: z.string(),
});

export async function POST(req: Request) {
  if (req.method !== "POST") {
    return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    console.time("transcribe " + req.headers.get("x-vercel-id") || "local");

    const { data, success } = schema.safeParse(await req.formData());
    if (!success) return new Response("Invalid request", { status: 400 });

    const translation = await translateText(
      data?.text,
      JSON.parse(data.config)
    );

    return NextResponse.json({ translation });
  } catch (error) {
    console.error("Error in translation API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

async function translateText(text: string, config: LangObj): Promise<string> {
  try {
    const chatCompletion = await groq.chat.completions.create({
      messages: [
        {
          role: "user",
          content: `Make sure to just respond with translated text, nothing else.
          Translate the given text from ${config.fromLanguage.englishName} language to ${config.toLanguage.englishName}: "${text}"
          Translated text in ${config.toLanguage.englishName}:-`,
        },
      ],
      model: "llama3-70b-8192",
      temperature: 0.7,
      max_tokens: 1024,
      top_p: 1,
      stream: true,
      stop: null,
    });

    let str = "";
    for await (const chunk of chatCompletion) {
      str = `${str} ${chunk.choices[0]?.delta?.content || ""}`;
    }
    return str;
  } catch (error) {
    console.error("Error in translation:", error);
    return "";
  }
}

export const config = {
  api: {
    bodyParser: false,
  },
};
