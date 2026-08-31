"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { Organograma } from "@/components/Organograma";
import { FilaAprovacao } from "@/components/FilaAprovacao";
import { LinhaDoTempo } from "@/components/LinhaDoTempo";
import styles from "./vendas.module.css";

interface Pedido {
  cod_pedido: string;
  data: string;
  cod_cliente: string;
  canal: string;
  mensagem: string;
  status: "novo" | "processando" | "aguardando_aprovacao" | "respondido" | "rejeitado";
  cliente_nome?: string;
}

type Tab = "kanban" | "aprovacoes";

const STATUSES = ["novo", "processando", "aguardando_aprovacao", "respondido", "rejeitado"];

export default function VendasPage() {
  const router = useRouter();
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [clientes, setClientes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("kanban");
  const [selectedPedido, setSelectedPedido] = useState<string | null>(null);
  const [showNovoForm, setShowNovoForm] = useState(false);
  const [novoFormData, setNovoFormData] = useState({
    cod_cliente: "",
    canal: "",
    mensagem: "",
  });

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
          .select("areas")
          .eq("id", user.id)
          .single();

        if (!perfilData?.areas?.includes("vendas")) {
          router.push("/");
          return;
        }

        await loadPedidos();
        await loadClientes();
      } catch (error) {
        console.error("Access error:", error);
        router.push("/login");
      } finally {
        setLoading(false);
      }
    };

    checkAccess();
  }, [router]);

  const loadPedidos = async () => {
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from("pedidos_orcamento")
        .select("*")
        .order("data", { ascending: false });

      if (data) {
        setPedidos(data);
      }
    } catch (error) {
      console.error("Error loading pedidos:", error);
    }
  };

  const loadClientes = async () => {
    try {
      const supabase = createClient();
      const { data } = await supabase.from("clientes").select("cod_cliente, nome");

      if (data) {
        const clientesMap: Record<string, string> = {};
        data.forEach((c: any) => {
          clientesMap[c.cod_cliente] = c.nome;
        });
        setClientes(clientesMap);
      }
    } catch (error) {
      console.error("Error loading clientes:", error);
    }
  };

  const handleNovoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const supabase = createClient();

      // Gerar próximo cod_pedido
      const { data: maxPedido } = await supabase
        .from("pedidos_orcamento")
        .select("cod_pedido")
        .order("cod_pedido", { ascending: false })
        .limit(1);

      let nextNum = 1;
      if (maxPedido && maxPedido.length > 0) {
        const last = maxPedido[0].cod_pedido;
        const num = parseInt(last.replace("PED", ""));
        nextNum = num + 1;
      }
      const newCodPedido = `PED${String(nextNum).padStart(3, "0")}`;

      const { error } = await supabase.from("pedidos_orcamento").insert({
        cod_pedido: newCodPedido,
        cod_cliente: novoFormData.cod_cliente,
        canal: novoFormData.canal,
        mensagem: novoFormData.mensagem,
        status: "novo",
        data: new Date().toISOString().split("T")[0],
      });

      if (!error) {
        setNovoFormData({ cod_cliente: "", canal: "", mensagem: "" });
        setShowNovoForm(false);
        await loadPedidos();
      }
    } catch (error) {
      console.error("Error creating pedido:", error);
    }
  };

  const handleProcessar = async (codPedido: string) => {
    try {
      const response = await fetch("/api/vendas/processar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cod_pedido: codPedido }),
      });

      if (response.ok) {
        setSelectedPedido(codPedido);
        await loadPedidos();
      }
    } catch (error) {
      console.error("Error processing pedido:", error);
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
        <h1>Vendas</h1>
        <button onClick={() => router.push("/")} className={styles.backBtn}>
          Voltar
        </button>
      </div>

      <div className={styles.main}>
        {selectedPedido && (
          <div className={styles.organogramaSection}>
            <Organograma area="vendas" item_id={selectedPedido} />
          </div>
        )}

        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${activeTab === "kanban" ? styles.active : ""}`}
            onClick={() => setActiveTab("kanban")}
          >
            Pedidos
          </button>
          <button
            className={`${styles.tab} ${activeTab === "aprovacoes" ? styles.active : ""}`}
            onClick={() => setActiveTab("aprovacoes")}
          >
            Aprovações
          </button>
        </div>

        {activeTab === "kanban" ? (
          <div className={styles.kanbanSection}>
            <button onClick={() => setShowNovoForm(true)} className={styles.novoPedidoBtn}>
              + Novo Pedido
            </button>

            {showNovoForm && (
              <div className={styles.novoModal}>
                <div className={styles.novoForm}>
                  <h3>Novo Pedido</h3>
                  <form onSubmit={handleNovoSubmit}>
                    <select
                      value={novoFormData.cod_cliente}
                      onChange={(e) =>
                        setNovoFormData({ ...novoFormData, cod_cliente: e.target.value })
                      }
                      required
                    >
                      <option value="">Selecione o cliente</option>
                      {Object.entries(clientes).map(([cod, nome]) => (
                        <option key={cod} value={cod}>
                          {nome}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      placeholder="Canal (email, whatsapp, telefone)"
                      value={novoFormData.canal}
                      onChange={(e) =>
                        setNovoFormData({ ...novoFormData, canal: e.target.value })
                      }
                      required
                    />
                    <textarea
                      placeholder="Mensagem"
                      value={novoFormData.mensagem}
                      onChange={(e) =>
                        setNovoFormData({ ...novoFormData, mensagem: e.target.value })
                      }
                      required
                    />
                    <div className={styles.formButtons}>
                      <button type="submit">Criar</button>
                      <button
                        type="button"
                        onClick={() => setShowNovoForm(false)}
                      >
                        Cancelar
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            <div className={styles.kanban}>
              {STATUSES.map((status) => (
                <div key={status} className={styles.column}>
                  <h3>{status.replace("_", " ").toUpperCase()}</h3>
                  <div className={styles.cards}>
                    {pedidos
                      .filter((p) => p.status === status)
                      .map((pedido) => (
                        <div
                          key={pedido.cod_pedido}
                          className={styles.card}
                          onClick={() => setSelectedPedido(pedido.cod_pedido)}
                        >
                          <div className={styles.cardHeader}>
                            <strong>{pedido.cod_pedido}</strong>
                            <span className={styles.canal}>{pedido.canal}</span>
                          </div>
                          <div className={styles.cardBody}>
                            <div className={styles.cliente}>
                              {clientes[pedido.cod_cliente] || pedido.cod_cliente}
                            </div>
                            <div className={styles.data}>{pedido.data}</div>
                            <div className={styles.mensagem}>
                              {pedido.mensagem.substring(0, 80)}
                              {pedido.mensagem.length > 80 ? "..." : ""}
                            </div>
                          </div>
                          {status === "novo" && (
                            <button
                              className={styles.processarBtn}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleProcessar(pedido.cod_pedido);
                              }}
                            >
                              Processar
                            </button>
                          )}
                        </div>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className={styles.aprovacaoSection}>
            <FilaAprovacao area="vendas" />
          </div>
        )}

        {selectedPedido && (
          <div className={styles.linhaDoTempoSection}>
            <button
              className={styles.closeBtn}
              onClick={() => setSelectedPedido(null)}
            >
              ✕
            </button>
            <LinhaDoTempo item_id={selectedPedido} area="vendas" />
          </div>
        )}
      </div>
    </div>
  );
}
