"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import styles from "./admin.module.css";

interface PerfilRow {
  id: string;
  email: string;
  nome: string;
  papel: string;
  areas: string[];
}

export default function AdminPage() {
  const router = useRouter();
  const [perfis, setPerfis] = useState<PerfilRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const [formData, setFormData] = useState({
    email: "",
    password: "",
    nome: "",
    papel: "operador",
    areas: [] as string[],
  });
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");

  useEffect(() => {
    const checkAccess = async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
          router.push("/login");
          return;
        }

        const { data: perfilData } = await supabase
          .from("perfis")
          .select("papel")
          .eq("id", user.id)
          .single();

        if (perfilData?.papel !== "admin") {
          router.push("/");
          return;
        }

        setIsAdmin(true);
        await loadPerfis();
      } catch (error) {
        console.error("Access error:", error);
        router.push("/login");
      } finally {
        setLoading(false);
      }
    };

    checkAccess();
  }, [router]);

  const loadPerfis = async () => {
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from("perfis")
        .select("id,email,nome,papel,areas");

      if (data) {
        setPerfis(data);
      }
    } catch (error) {
      console.error("Load error:", error);
    }
  };

  const handleAreaToggle = (area: string) => {
    setFormData((prev) => ({
      ...prev,
      areas: prev.areas.includes(area)
        ? prev.areas.filter((a) => a !== area)
        : [...prev.areas, area],
    }));
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    setFormSuccess("");
    setFormLoading(true);

    try {
      const response = await fetch("/api/admin/create-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Erro ao criar usuário");
      }

      setFormSuccess("Usuário criado com sucesso!");
      setFormData({ email: "", password: "", nome: "", papel: "operador", areas: [] });
      await loadPerfis();

      setTimeout(() => setFormSuccess(""), 3000);
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Erro ao criar usuário"
      );
    } finally {
      setFormLoading(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <p>Verificando acesso...</p>
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  const AREAS = ["vendas", "financeiro", "rh", "juridico", "operacoes"];

  return (
    <div className={styles.container}>
      <div className={styles.topbar}>
        <h1>Admin - Gerenciar Usuários</h1>
        <button onClick={() => router.push("/")} className={styles.backBtn}>
          Voltar
        </button>
      </div>

      <main className={styles.main}>
        <div className={styles.content}>
          {/* Tabela de perfis */}
          <section className={styles.section}>
            <h2>Perfis Existentes</h2>
            <div className={styles.tableContainer}>
              <table className={styles.table}>
                <thead className={styles.tableHead}>
                  <tr>
                    <th className={styles.tableHeadCell}>E-mail</th>
                    <th className={styles.tableHeadCell}>Nome</th>
                    <th className={styles.tableHeadCell}>Papel</th>
                    <th className={styles.tableHeadCell}>Áreas</th>
                  </tr>
                </thead>
                <tbody className={styles.tableBody}>
                  {perfis.length === 0 ? (
                    <tr className={styles.tableBodyRow}>
                      <td colSpan={4} className={styles.tableEmpty}>
                        Nenhum perfil encontrado
                      </td>
                    </tr>
                  ) : (
                    perfis.map((perfil) => (
                      <tr key={perfil.id} className={styles.tableBodyRow}>
                        <td className={styles.tableCell}>{perfil.email}</td>
                        <td className={styles.tableCell}>{perfil.nome}</td>
                        <td className={styles.tableCell}>
                          <span className={styles.badge}>
                            {perfil.papel}
                          </span>
                        </td>
                        <td className={styles.tableCell}>{perfil.areas?.join(", ") || "-"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Formulário de criação */}
          <section className={styles.section}>
            <h2>Criar Novo Usuário</h2>

            {formError && <div className={styles.error}>{formError}</div>}
            {formSuccess && <div className={styles.success}>{formSuccess}</div>}

            <form onSubmit={handleCreateUser} className={styles.form}>
              <div className={styles.formGroup}>
                <label htmlFor="email">E-mail</label>
                <input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                  required
                  disabled={formLoading}
                />
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="password">Senha Inicial</label>
                <input
                  id="password"
                  type="password"
                  value={formData.password}
                  onChange={(e) =>
                    setFormData({ ...formData, password: e.target.value })
                  }
                  required
                  disabled={formLoading}
                />
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="nome">Nome</label>
                <input
                  id="nome"
                  type="text"
                  value={formData.nome}
                  onChange={(e) =>
                    setFormData({ ...formData, nome: e.target.value })
                  }
                  required
                  disabled={formLoading}
                />
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="papel">Papel</label>
                <select
                  id="papel"
                  value={formData.papel}
                  onChange={(e) =>
                    setFormData({ ...formData, papel: e.target.value })
                  }
                  disabled={formLoading}
                >
                  <option value="operador">Operador</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              <div className={styles.formGroup}>
                <label>Áreas</label>
                <div className={styles.checkboxGroup}>
                  {AREAS.map((area) => (
                    <label key={area} className={styles.checkbox}>
                      <input
                        type="checkbox"
                        checked={formData.areas.includes(area)}
                        onChange={() => handleAreaToggle(area)}
                        disabled={formLoading}
                      />
                      {area}
                    </label>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={formLoading}
                className={styles.submitBtn}
              >
                {formLoading ? "Criando..." : "Criar Usuário"}
              </button>
            </form>
          </section>
        </div>
      </main>
    </div>
  );
}
