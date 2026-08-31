import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
import { readFileSync } from "fs";
import { join } from "path";

export interface AgenteContexto {
  area: "vendas" | "financeiro";
  item_tipo: "pedido" | "divergencia" | string;
  item_id: string;
  chamado_por?: string;
}

export interface AgenteResultado {
  saida: unknown;
  execucao_id: string;
}

export async function agente(
  papel: string,
  entrada: unknown,
  contexto: AgenteContexto
): Promise<AgenteResultado> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const client = new Anthropic();

  const inicio = new Date();
  let execucao_id = "";

  try {
    const { data: exec, error: insertError } = await supabase
      .from("execucoes_agentes")
      .insert({
        area: contexto.area,
        item_tipo: contexto.item_tipo,
        item_id: contexto.item_id,
        agente: papel,
        chamado_por: contexto.chamado_por || null,
        status: "rodando",
        entrada: entrada,
        inicio: inicio.toISOString(),
      })
      .select("id")
      .single();

    if (insertError || !exec) {
      throw new Error(`Erro ao criar execução: ${insertError?.message}`);
    }

    execucao_id = exec.id;

    const promptPath = join(
      process.cwd(),
      "prompts",
      contexto.area,
      `${papel}.md`
    );

    let systemPrompt = "";
    try {
      systemPrompt = readFileSync(promptPath, "utf-8");
    } catch (err) {
      throw new Error(`Prompt não encontrado: prompts/${contexto.area}/${papel}.md`);
    }

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: JSON.stringify(entrada),
        },
      ],
    });

    const textContent = response.content.find((c) => c.type === "text");
    if (!textContent || textContent.type !== "text") {
      throw new Error("Resposta da API sem texto");
    }

    let saida: unknown;
    try {
      saida = JSON.parse(textContent.text);
    } catch (parseError) {
      throw new Error(`Resposta não é JSON válido: ${textContent.text.slice(0, 100)}`);
    }

    const fim = new Date();

    const { error: updateError } = await supabase
      .from("execucoes_agentes")
      .update({
        status: "ok",
        saida: saida,
        tokens_entrada: response.usage.input_tokens,
        tokens_saida: response.usage.output_tokens,
        fim: fim.toISOString(),
      })
      .eq("id", execucao_id);

    if (updateError) {
      console.error("Erro ao atualizar execução:", updateError);
    }

    return {
      saida,
      execucao_id,
    };
  } catch (error) {
    const mensagemErro =
      error instanceof Error ? error.message : "Erro desconhecido";

    console.error(`Erro na execução do agente ${papel}:`, error);

    if (execucao_id) {
      const fim = new Date();
      try {
        await supabase
          .from("execucoes_agentes")
          .update({
            status: "erro",
            erro: mensagemErro,
            fim: fim.toISOString(),
          })
          .eq("id", execucao_id);
      } catch (err) {
        console.error("Erro ao registrar falha:", err);
      }
    }

    throw error;
  }
}
