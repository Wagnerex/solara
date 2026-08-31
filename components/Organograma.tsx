"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import styles from "./Organograma.module.css";

interface Execucao {
  id: string;
  agente: string;
  status: "rodando" | "ok" | "erro";
  tokens_entrada?: number;
  tokens_saida?: number;
  inicio?: string;
  fim?: string;
}

interface OrganogramaProps {
  area: "vendas" | "financeiro";
  item_id: string;
}

const AGENTES_VENDAS = ["triador", "pesquisador", "redator", "revisor"];
const AGENTES_FINANCEIRO = ["investigador", "consolidador", "revisor"];

export function Organograma({ area, item_id }: OrganogramaProps) {
  const [execucoes, setExecucoes] = useState<Map<string, Execucao>>(new Map());
  const [loading, setLoading] = useState(true);

  const agentes = area === "vendas" ? AGENTES_VENDAS : AGENTES_FINANCEIRO;

  useEffect(() => {
    const supabase = createClient();

    const loadInitial = async () => {
      const { data } = await supabase
        .from("execucoes_agentes")
        .select("*")
        .eq("item_id", item_id)
        .eq("area", area);

      if (data) {
        const map = new Map();
        data.forEach((exec) => {
          map.set(exec.agente, exec);
        });
        setExecucoes(map);
      }
      setLoading(false);
    };

    loadInitial();

    const channel = supabase
      .channel(`execucoes-${area}-${item_id}`)
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
            const updated = new Map(prev);
            updated.set(newExec.agente, newExec);
            return updated;
          });
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [item_id, area]);

  if (loading) {
    return <div className={styles.organograma}>Carregando...</div>;
  }

  return (
    <div className={styles.organograma}>
      <div className={styles.orquestradorRow}>
        <div className={styles.orquestrador}>Orquestrador</div>
      </div>

      <div className={styles.agentesRow}>
        {agentes.map((agente) => {
          const exec = execucoes.get(agente);
          const status = exec?.status || "sem_execucao";
          const tempoMs =
            exec?.fim && exec?.inicio
              ? new Date(exec.fim).getTime() - new Date(exec.inicio).getTime()
              : 0;
          const tempoSeg = (tempoMs / 1000).toFixed(2);

          return (
            <div key={agente} className={styles.agenteCard}>
              <div className={`${styles.card} ${styles[status]}`}>
                <div className={styles.nomAgente}>{agente}</div>

                {status === "ok" && (
                  <div className={styles.info}>
                    <div>{tempoSeg}s</div>
                    <div>
                      {exec?.tokens_saida && exec?.tokens_entrada
                        ? `${exec.tokens_entrada}/${exec.tokens_saida}`
                        : "-"}
                    </div>
                  </div>
                )}

                {status === "rodando" && (
                  <div className={styles.pulsing}>Processando...</div>
                )}

                {status === "erro" && (
                  <div className={styles.erro}>Erro</div>
                )}
              </div>

              {status !== "sem_execucao" && (
                <div className={styles.arrow}>↓</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
