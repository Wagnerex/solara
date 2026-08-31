"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import styles from "./FilaAprovacao.module.css";

interface Aprovacao {
  id: string;
  titulo: string;
  proposta: unknown;
  status: string;
  item_id: string;
}

interface FilaAprovacaoProps {
  area: "vendas" | "financeiro";
}

export function FilaAprovacao({ area }: FilaAprovacaoProps) {
  const [aprovacoes, setAprovacoes] = useState<Aprovacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [observacao, setObservacao] = useState("");

  useEffect(() => {
    const supabase = createClient();

    const loadInitial = async () => {
      const { data } = await supabase
        .from("aprovacoes")
        .select("*")
        .eq("area", area)
        .eq("status", "pendente")
        .order("criado_em", { ascending: false });

      if (data) {
        setAprovacoes(data);
      }
      setLoading(false);
    };

    loadInitial();

    const channel = supabase
      .channel(`aprovacoes-${area}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "aprovacoes",
          filter: `area=eq.${area}`,
        },
        (payload) => {
          const newAp = payload.new as Aprovacao;
          setAprovacoes((prev) => {
            if (newAp.status === "pendente") {
              const filtered = prev.filter((a) => a.id !== newAp.id);
              return [newAp, ...filtered];
            } else {
              return prev.filter((a) => a.id !== newAp.id);
            }
          });
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [area]);

  const handleApprove = async (id: string) => {
    setProcessingId(id);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) return;

      const { error } = await supabase
        .from("aprovacoes")
        .update({
          status: "aprovada",
          decidido_por: user.id,
          decidido_em: new Date().toISOString(),
        })
        .eq("id", id);

      if (!error) {
        setAprovacoes((prev) => prev.filter((a) => a.id !== id));
      }
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (id: string) => {
    if (!observacao.trim()) {
      alert("Preencha a observação para rejeitar");
      return;
    }

    setProcessingId(id);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) return;

      const { error } = await supabase
        .from("aprovacoes")
        .update({
          status: "rejeitada",
          decidido_por: user.id,
          decidido_em: new Date().toISOString(),
          observacao,
        })
        .eq("id", id);

      if (!error) {
        setAprovacoes((prev) => prev.filter((a) => a.id !== id));
        setObservacao("");
        setExpandedId(null);
      }
    } finally {
      setProcessingId(null);
    }
  };

  if (loading) {
    return <div className={styles.container}>Carregando...</div>;
  }

  return (
    <div className={styles.container}>
      <h3>Fila de Aprovação ({aprovacoes.length})</h3>

      {aprovacoes.length === 0 ? (
        <p className={styles.empty}>Nenhuma aprovação pendente</p>
      ) : (
        <div className={styles.list}>
          {aprovacoes.map((ap) => (
            <div key={ap.id} className={styles.item}>
              <div
                className={styles.header}
                onClick={() => setExpandedId(expandedId === ap.id ? null : ap.id)}
              >
                <div className={styles.titulo}>{ap.titulo}</div>
                <div className={styles.arrow}>
                  {expandedId === ap.id ? "▼" : "▶"}
                </div>
              </div>

              {expandedId === ap.id && (
                <div className={styles.details}>
                  <div className={styles.proposta}>
                    <strong>Proposta:</strong>
                    <pre>{JSON.stringify(ap.proposta, null, 2)}</pre>
                  </div>

                  <div className={styles.actions}>
                    <button
                      className={styles.approveBtn}
                      onClick={() => handleApprove(ap.id)}
                      disabled={processingId === ap.id}
                    >
                      {processingId === ap.id ? "..." : "Aprovar"}
                    </button>

                    <div className={styles.rejectSection}>
                      <textarea
                        placeholder="Observação (obrigatória para rejeitar)"
                        value={observacao}
                        onChange={(e) => setObservacao(e.target.value)}
                        className={styles.textarea}
                        disabled={processingId === ap.id}
                      />
                      <button
                        className={styles.rejectBtn}
                        onClick={() => handleReject(ap.id)}
                        disabled={processingId === ap.id}
                      >
                        {processingId === ap.id ? "..." : "Rejeitar"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
