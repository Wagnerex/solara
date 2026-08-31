"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import styles from "./home.module.css";

interface Perfil {
  papel: string;
  areas: string[];
}

const AREAS = [
  { id: "vendas", nome: "Vendas", ativo: true },
  { id: "financeiro", nome: "Financeiro", ativo: true },
  { id: "rh", nome: "RH", ativo: false },
  { id: "juridico", nome: "Jurídico", ativo: false },
  { id: "operacoes", nome: "Operações", ativo: false },
];

export default function HomePage() {
  const router = useRouter();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user || !user.email) {
          router.push("/login");
          return;
        }

        setUserEmail(user.email);

        const { data: perfilData, error: perfilError } = await supabase
          .from("perfis")
          .select("papel,areas")
          .eq("id", user.id)
          .single();

        console.log("Perfil loaded:", perfilData, "Error:", perfilError);

        if (perfilData) {
          console.log("Setting perfil with papel:", perfilData.papel);
          setPerfil(perfilData);
        } else {
          console.log("No perfil data found for user:", user.id);
        }
      } catch (error) {
        console.error("Auth error:", error);
        router.push("/login");
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, [router]);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  const handleAreaClick = (areaId: string) => {
    if (areaId === "vendas" || areaId === "financeiro") {
      router.push(`/${areaId}`);
    }
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <p>Carregando...</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.topbar}>
        <h1>Solara OS</h1>
        <div className={styles.userSection}>
          <span>{userEmail}</span>
          {perfil?.papel?.toLowerCase() === "admin" && (
            <button className={styles.adminBtn} onClick={() => router.push("/admin")}>
              Admin
            </button>
          )}
          <button onClick={handleLogout}>Sair</button>
        </div>
      </div>

      <main className={styles.main}>
        <div className={styles.areasGrid}>
          {AREAS.map((area) => {
            const temAcesso = perfil?.areas?.includes(area.id) ?? false;
            const podeAcessar = area.ativo && temAcesso;

            return (
              <div
                key={area.id}
                className={`${styles.areaCard} ${
                  !area.ativo ? styles.disabled : podeAcessar ? styles.active : styles.noAccess
                }`}
                onClick={() => podeAcessar && handleAreaClick(area.id)}
              >
                <h3>{area.nome}</h3>
                {!area.ativo && <span className={styles.badge}>em breve</span>}
                {area.ativo && !temAcesso && <span className={styles.badge}>sem acesso</span>}
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
