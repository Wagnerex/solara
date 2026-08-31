import { agente } from "@/lib/agente";
import { createClient } from "@/utils/supabase/server";

export async function orquestradorVendas(
  pedido: any,
  cookieStore: Awaited<ReturnType<typeof import("next/headers").cookies>>
) {
  const supabase = createClient(cookieStore);

  try {
    // 1. Criar execução raiz do orquestrador
    const { data: orquestradorExec } = await supabase
      .from("execucoes_agentes")
      .insert({
        area: "vendas",
        item_tipo: "pedido",
        item_id: pedido.cod_pedido,
        agente: "orquestrador",
        status: "rodando",
        entrada: { cod_pedido: pedido.cod_pedido },
        inicio: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (!orquestradorExec) throw new Error("Erro ao criar execução raiz");

    const chamadoPor = orquestradorExec.id;

    // 2. Buscar cliente
    const { data: cliente } = await supabase
      .from("clientes")
      .select("cod_cliente, nome, segmento")
      .eq("cod_cliente", pedido.cod_cliente)
      .single();

    if (!cliente) throw new Error("Cliente não encontrado");

    // 3. TRIADOR - Classificar pedido
    const triadorResult = await agente(
      "triador",
      {
        mensagem: pedido.mensagem,
        canal: pedido.canal,
        cliente: {
          cod_cliente: cliente.cod_cliente,
          nome: cliente.nome,
          segmento: cliente.segmento,
        },
      },
      {
        area: "vendas",
        item_tipo: "pedido",
        item_id: pedido.cod_pedido,
        chamado_por: chamadoPor,
      }
    );

    const triagem = triadorResult.saida as any;

    // Se não é orçamento, criar aprovação e encerrar
    if (!["orcamento", "complemento"].includes(triagem.tipo)) {
      await supabase.from("aprovacoes").insert({
        area: "vendas",
        item_tipo: "pedido",
        item_id: pedido.cod_pedido,
        titulo: `Não é orçamento: ${triagem.tipo}`,
        proposta: triagem,
        status: "pendente",
      });

      await supabase
        .from("pedidos_orcamento")
        .update({ status: "aguardando_aprovacao" })
        .eq("cod_pedido", pedido.cod_pedido);

      await supabase
        .from("execucoes_agentes")
        .update({ status: "ok", fim: new Date().toISOString() })
        .eq("id", chamadoPor);

      return;
    }

    // 4. PESQUISADOR - Buscar produtos e contexto
    const [produtosData, pedidosAnterioresData] = await Promise.all([
      buscarProdutos(supabase, triagem.itens),
      buscarPedidosAnteriores(supabase, pedido.cod_cliente),
    ]);

    const pesquisadorResult = await agente(
      "pesquisador",
      {
        itens_pedidos: triagem.itens,
        candidatos_catalogo: produtosData,
        cliente: cliente,
        pedidos_anteriores: pedidosAnterioresData,
      },
      {
        area: "vendas",
        item_tipo: "pedido",
        item_id: pedido.cod_pedido,
        chamado_por: chamadoPor,
      }
    );

    const contexto = pesquisadorResult.saida as any;

    // 5. REDATOR - Escrever resposta
    const redatorResult = await agente(
      "redator",
      {
        triagem,
        contexto,
        cliente,
      },
      {
        area: "vendas",
        item_tipo: "pedido",
        item_id: pedido.cod_pedido,
        chamado_por: chamadoPor,
      }
    );

    let respostaFinal = redatorResult.saida as any;

    // 6. REVISOR - Validar resposta (até 2 tentativas)
    let revisaoFinal: any = null;
    let tentativas = 0;

    for (tentativas = 0; tentativas < 2; tentativas++) {
      const revisorResult = await agente(
        "revisor",
        {
          resposta: respostaFinal.resposta,
          contexto,
          regras: {
            nao_prometer_sem_estoque: true,
            desconto_maximo: contexto.desconto_maximo_pct,
            validar_prazos: true,
          },
        },
        {
          area: "vendas",
          item_tipo: "pedido",
          item_id: pedido.cod_pedido,
          chamado_por: chamadoPor,
        }
      );

      revisaoFinal = revisorResult.saida as any;

      if (revisaoFinal.aprovado) {
        break;
      }

      // Se não aprovado e há tentativas, chamar redator de novo
      if (tentativas < 1) {
        const redatorRetryResult = await agente(
          "redator",
          {
            triagem,
            contexto,
            cliente,
            ajustes: revisaoFinal.motivos,
          },
          {
            area: "vendas",
            item_tipo: "pedido",
            item_id: pedido.cod_pedido,
            chamado_por: chamadoPor,
          }
        );

        respostaFinal = redatorRetryResult.saida as any;
      }
    }

    // 7. Criar aprovação
    await supabase.from("aprovacoes").insert({
      area: "vendas",
      item_tipo: "pedido",
      item_id: pedido.cod_pedido,
      titulo: `${cliente.nome} · ${respostaFinal.resumo}`,
      proposta: {
        resposta: respostaFinal.resposta,
        triagem,
        contexto,
        revisao: revisaoFinal,
      },
      status: "pendente",
    });

    // 8. Atualizar pedido para aguardando_aprovacao
    await supabase
      .from("pedidos_orcamento")
      .update({ status: "aguardando_aprovacao" })
      .eq("cod_pedido", pedido.cod_pedido);

    // 9. Fechar execução raiz
    await supabase
      .from("execucoes_agentes")
      .update({ status: "ok", fim: new Date().toISOString() })
      .eq("id", chamadoPor);
  } catch (error) {
    console.error("Orquestrador vendas error:", error);
    throw error;
  }
}

async function buscarProdutos(supabase: any, itens: any[]) {
  try {
    const palavrasChave = itens.flatMap((i: any) =>
      i.descricao_cliente.split(" ")
    );

    const { data } = await supabase
      .from("produtos")
      .select("cod_produto, descricao, preco, estoque, prazo_reposicao");

    if (!data) return [];

    // Simples busca por palavra-chave (não é ML, é determinístico)
    return data.filter((p: any) =>
      palavrasChave.some((palavra: string) =>
        p.descricao.toLowerCase().includes(palavra.toLowerCase())
      )
    );
  } catch (error) {
    console.error("Erro ao buscar produtos:", error);
    return [];
  }
}

async function buscarPedidosAnteriores(supabase: any, codCliente: string) {
  try {
    const dataLimite = new Date();
    dataLimite.setDate(dataLimite.getDate() - 30);

    const { data } = await supabase
      .from("pedidos_orcamento")
      .select("*")
      .eq("cod_cliente", codCliente)
      .gte("data", dataLimite.toISOString().split("T")[0])
      .limit(5);

    return data || [];
  } catch (error) {
    console.error("Erro ao buscar pedidos anteriores:", error);
    return [];
  }
}
