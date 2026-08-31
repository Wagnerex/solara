import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
import { orquestradorVendas } from "@/lib/orquestradores/vendas";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Não autenticado" },
        { status: 401 }
      );
    }

    const { cod_pedido } = await request.json();

    if (!cod_pedido) {
      return NextResponse.json(
        { error: "cod_pedido é obrigatório" },
        { status: 400 }
      );
    }

    const { data: pedido } = await supabase
      .from("pedidos_orcamento")
      .select("*")
      .eq("cod_pedido", cod_pedido)
      .single();

    if (!pedido) {
      return NextResponse.json(
        { error: "Pedido não encontrado" },
        { status: 404 }
      );
    }

    // Atualizar status para processando
    await supabase
      .from("pedidos_orcamento")
      .update({ status: "processando" })
      .eq("cod_pedido", cod_pedido);

    // Chamar orquestrador
    await orquestradorVendas(pedido, cookieStore);

    return NextResponse.json({
      success: true,
      message: "Pedido em processamento",
    });
  } catch (error) {
    console.error("Vendas processar error:", error);
    return NextResponse.json(
      { error: "Erro ao processar pedido" },
      { status: 500 }
    );
  }
}
