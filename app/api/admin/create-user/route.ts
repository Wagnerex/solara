import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

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

    const { data: perfil } = await supabase
      .from("perfis")
      .select("papel")
      .eq("id", user.id)
      .single();

    if (perfil?.papel !== "admin") {
      return NextResponse.json(
        { error: "Sem permissão" },
        { status: 403 }
      );
    }

    const { email, password, nome, papel, areas } = await request.json();

    if (!email || !password || !nome) {
      return NextResponse.json(
        { error: "E-mail, senha e nome são obrigatórios" },
        { status: 400 }
      );
    }

    const supabaseAdmin = createClient(cookieStore);

    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authError || !authUser?.user) {
      return NextResponse.json(
        { error: authError?.message || "Erro ao criar usuário no Auth" },
        { status: 400 }
      );
    }

    const { error: perfilError } = await supabaseAdmin
      .from("perfis")
      .insert({
        id: authUser.user.id,
        email,
        nome,
        papel: papel || "operador",
        areas: areas || [],
      });

    if (perfilError) {
      await supabaseAdmin.auth.admin.deleteUser(authUser.user.id);
      return NextResponse.json(
        { error: "Erro ao criar perfil: " + perfilError.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Usuário criado com sucesso",
    });
  } catch (error) {
    console.error("Create user error:", error);
    return NextResponse.json(
      { error: "Erro ao criar usuário" },
      { status: 500 }
    );
  }
}
