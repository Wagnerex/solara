"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import styles from "./LinhaDoTempo.module.css";

interface Execucao {
  id: string;
  agente: string;
  status: string;
  entrada: unknown;
  saida: unknown;
  erro?: string;
  tokens_entrada?: number;
  tokens_saida?: number;
  inicio?: string;
  fim?: string;
}

interface LinhaDoTempoProps {
  item_id: string;
  area: "vendas" | "financeiro";
}

export function LinhaDoTempo({ item_id, area }: LinhaDoTempoProps) {
  const [execucoes, setExecucoes] = useState<Execucao[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();

    const loadInitial = async () => {
      const { data } = await supabase
        .from("execucoes_agentes")
        .select("*")
        .eq("item_id", item_id)
        .eq("area", area)
        .order("inicio", { ascending: true });

      if (data) {
        setExecucoes(data);
      }
      setLoading(false);
    };

    loadInitial();

    const channel = supabase
      .channel(`linha-tempo-${area}-${item_id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "execucoes_agentes",
          filter: `item_id=eq.${item_id}`,
        },
        (payload) => {
          const newExec = payload.new as Execucao;
          setExecucoes((prev) => {
            const filtered = prev.filter((e) => e.id !== newExec.id);
            return [...filtered, newExec].sort(
              (a, b) =>
                new Date(a.inicio || 0).getTime() -
                new Date(b.inicio || 0).getTime()
            );
          });
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [item_id, area]);

  if (loading) {
    return <div>Carregando...</div>;
  }

  return (
    <div className={styles.timeline}>
      <h3>Histórico de Execuções</h3>

      {execucoes.length === 0 ? (
        <p className={styles.empty}>Sem execuções</p>
      ) : (
        <div className={styles.list}>
          {execucoes.map((exec) => {
            const tempoMs =
              exec.fim && exec.inicio
                ? new Date(exec.fim).getTime() -
                  new Date(exec.inicio).getTime()
                : 0;
            const tempoSeg = (tempoMs / 1000).toFixed(2);
            const entradaStr = (typeof exec.entrada === 'string' ? exec.entrada : JSON.stringify(exec.entrada, null, 2)) as string;
            const saidaStr = (typeof exec.saida === 'string' ? exec.saida : JSON.stringify(exec.saida, null, 2)) as string;

            return (
              <div key={exec.id} className={styles.item}>
                <div
                  className={`${styles.header} ${styles[exec.status]}`}
                  onClick={() =>
                    setExpandedId(expandedId === exec.id ? null : exec.id)
                  }
                >
                  <div className={styles.info}>
                    <div className={styles.agente}>
                      {exec.agente}
                      <span className={styles.status}>{exec.status}</span>
                    </div>
                    <div className={styles.meta}>
                      {exec.inicio && new Date(exec.inicio).toLocaleTimeString()}
                      {exec.status === "ok" && ` · ${tempoSeg}s · ${exec.tokens_entrada}/${exec.tokens_saida} tokens`}
                    </div>
                  </div>
                  <div className={styles.arrow}>
                    {expandedId === exec.id ? "▼" : "▶"}
                  </div>
                </div>

                {expandedId === exec.id ? (
                  <div className={styles.details}>
                    <div className={styles.section}>
                      <strong>Entrada:</strong>
                      <pre>{entradaStr}</pre>
                    </div>

                    {exec.status === "ok" && exec.saida ? (
                      <div className={styles.section}>
                        <strong>Saída:</strong>
                        <pre>{saidaStr}</pre>
                      </div>
                    ) : null}

                    {exec.status === "erro" && exec.erro ? (
                      <div className={styles.section}>
                        <strong>Erro:</strong>
                        <pre className={styles.erro}>{exec.erro}</pre>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
