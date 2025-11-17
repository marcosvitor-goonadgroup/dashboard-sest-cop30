import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { fetchAllData } from "../service/ApiBase";
import * as DataRelations from "./DataRelations";

const DataContext = createContext();

export const useData = () => {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error("useData must be used within a DataProvider");
  }
  return context;
};

export const DataProvider = ({ children }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({});

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const result = await fetchAllData();
        setData(result);
        setError(null);
      } catch (err) {
        setError(err);
        console.error("Erro ao carregar dados:", err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  // Fun��o para atualizar filtros
  const updateFilters = useCallback((newFilters) => {
    setFilters(newFilters);
  }, []);

  // Fun��o para obter dados filtrados
  const getFilteredData = useCallback(() => {
    if (!data || !data.tables) return null;

    // Se n�o h� filtros, retorna todos os dados
    if (Object.keys(filters).length === 0) {
      return data.tables;
    }

    // Fun��o auxiliar para calcular idade
    const calcularIdade = (dataNascimento) => {
      if (!dataNascimento) return null;
      const hoje = new Date();
      const nascimento = new Date(dataNascimento);
      const diffAnos = hoje.getFullYear() - nascimento.getFullYear();
      const diffMeses = hoje.getMonth() - nascimento.getMonth();
      const diffDias = hoje.getDate() - nascimento.getDate();

      // Calcula a idade exata considerando mês e dia
      let idade = diffAnos;
      if (diffMeses < 0 || (diffMeses === 0 && diffDias < 0)) {
        idade--;
      }
      return idade;
    };

    // Fun��o auxiliar para determinar faixa et�ria
    const determinarFaixaEtaria = (dataNascimento) => {
      const idade = calcularIdade(dataNascimento);

      if (idade === null) return 'naoInformado';
      if (idade < 18) return 'menor18';
      if (idade >= 18 && idade <= 24) return '18-24';
      if (idade >= 25 && idade <= 40) return '25-40';
      if (idade >= 41 && idade <= 59) return '41-59';
      if (idade >= 60) return '60+';

      return 'naoInformado';
    };

    // Aplicar filtros nas tabelas - criar c�pias profundas
    const filteredTables = JSON.parse(JSON.stringify(data.tables));

    // PASSO 1: Filtrar usu�rios por tenho_conta e faixa et�ria
    let usuariosFiltradosIds = null;

    // Filtrar por conta BB
    if (filters.temContaBB !== undefined && filters.temContaBB !== null && filters.temContaBB !== '') {
      if (filteredTables.up_users?.data) {
        const usuariosFiltrados = filteredTables.up_users.data.filter(
          user => user.tenho_conta === (filters.temContaBB === 'true' || filters.temContaBB === true)
        );
        usuariosFiltradosIds = new Set(usuariosFiltrados.map(u => u.id));
      }
    }

    // Filtrar por faixa et�ria
    if (filters.faixaEtaria) {
      if (filteredTables.up_users?.data) {
        const usuariosFiltradosPorFaixa = filteredTables.up_users.data.filter(user => {
          const faixaDoUsuario = determinarFaixaEtaria(user.data_usuario);
          return faixaDoUsuario === filters.faixaEtaria;
        });

        const idsFaixa = new Set(usuariosFiltradosPorFaixa.map(u => u.id));

        if (usuariosFiltradosIds) {
          // Interseção dos dois filtros
          usuariosFiltradosIds = new Set([...usuariosFiltradosIds].filter(id => idsFaixa.has(id)));
        } else {
          usuariosFiltradosIds = idsFaixa;
        }
      }
    }

    // PASSO 2: Filtrar por ativa��o selecionada
    if (filters.ativacaoSelecionada) {
      // Filtrar checkins_ativacao_lnk pela ativa��o selecionada
      if (filteredTables.checkins_ativacao_lnk?.data) {
        filteredTables.checkins_ativacao_lnk.data =
          filteredTables.checkins_ativacao_lnk.data.filter(link =>
            link.ativacao_id === filters.ativacaoSelecionada
          );

        // Obter IDs dos checkins da ativa��o selecionada
        const checkinIdsAtivacao = new Set(
          filteredTables.checkins_ativacao_lnk.data.map(link => link.checkin_id)
        );

        // Filtrar checkins
        if (filteredTables.checkins?.data) {
          filteredTables.checkins.data = filteredTables.checkins.data.filter(checkin =>
            checkinIdsAtivacao.has(checkin.id)
          );
        }

        // Filtrar checkins_users_permissions_user_lnk para manter consist�ncia
        if (filteredTables.checkins_users_permissions_user_lnk?.data) {
          filteredTables.checkins_users_permissions_user_lnk.data =
            filteredTables.checkins_users_permissions_user_lnk.data.filter(link =>
              checkinIdsAtivacao.has(link.checkin_id)
            );

          // Obter IDs dos usu�rios que fizeram checkin nessa ativa��o
          const userIdsAtivacao = new Set(
            filteredTables.checkins_users_permissions_user_lnk.data.map(link => link.user_id)
          );

          // Filtrar resgates para manter apenas dos usu�rios da ativa��o
          if (filteredTables.resgates_users_permissions_user_lnk?.data) {
            filteredTables.resgates_users_permissions_user_lnk.data =
              filteredTables.resgates_users_permissions_user_lnk.data.filter(link =>
                userIdsAtivacao.has(link.user_id)
              );

            const resgateIds = new Set(
              filteredTables.resgates_users_permissions_user_lnk.data.map(link => link.resgate_id)
            );

            if (filteredTables.resgates?.data) {
              filteredTables.resgates.data = filteredTables.resgates.data.filter(resgate =>
                resgateIds.has(resgate.id)
              );
            }
          }
        }
      }
    }

    // PASSO 3: Se h� filtro de usu�rio, propagar para checkins e resgates
    if (usuariosFiltradosIds) {
      // Filtrar checkins_users_permissions_user_lnk
      if (filteredTables.checkins_users_permissions_user_lnk?.data) {
        filteredTables.checkins_users_permissions_user_lnk.data =
          filteredTables.checkins_users_permissions_user_lnk.data.filter(link =>
            usuariosFiltradosIds.has(link.user_id)
          );

        // Obter IDs dos checkins dos usu�rios filtrados
        const checkinIdsFiltrados = new Set(
          filteredTables.checkins_users_permissions_user_lnk.data.map(link => link.checkin_id)
        );

        // Filtrar tabela checkins
        if (filteredTables.checkins?.data) {
          filteredTables.checkins.data = filteredTables.checkins.data.filter(checkin =>
            checkinIdsFiltrados.has(checkin.id)
          );
        }

        // Filtrar checkins_ativacao_lnk para manter consist�ncia
        if (filteredTables.checkins_ativacao_lnk?.data) {
          filteredTables.checkins_ativacao_lnk.data =
            filteredTables.checkins_ativacao_lnk.data.filter(link =>
              checkinIdsFiltrados.has(link.checkin_id)
            );
        }
      }

      // Filtrar resgates_users_permissions_user_lnk
      if (filteredTables.resgates_users_permissions_user_lnk?.data) {
        filteredTables.resgates_users_permissions_user_lnk.data =
          filteredTables.resgates_users_permissions_user_lnk.data.filter(link =>
            usuariosFiltradosIds.has(link.user_id)
          );

        // Obter IDs dos resgates dos usu�rios filtrados
        const resgateIdsFiltrados = new Set(
          filteredTables.resgates_users_permissions_user_lnk.data.map(link => link.resgate_id)
        );

        // Filtrar tabela resgates
        if (filteredTables.resgates?.data) {
          filteredTables.resgates.data = filteredTables.resgates.data.filter(resgate =>
            resgateIdsFiltrados.has(resgate.id)
          );
        }
      }
    }

    return filteredTables;
  }, [data, filters]);

  // Fun��o para obter m�tricas processadas
  const getMetrics = useCallback(() => {
    const filteredData = getFilteredData();
    if (!filteredData) {
      return {
        totalUsuariosComAtivacoes: 0,
        totalCheckins: 0,
        totalResgates: 0,
        totalAtivacoes: 0,
        mediaGeralAvaliacoes: 0
      };
    }

    const checkins = filteredData.checkins?.data || [];
    const resgates = filteredData.resgates?.data || [];
    const ativacoes = filteredData.ativacoes?.data || [];
    const checkinsUsuariosLnk = filteredData.checkins_users_permissions_user_lnk?.data || [];
    const avaliacoes = filteredData.avaliacao_de_ativacaos?.data || [];

    // Usu�rios �nicos com check-in
    const usuariosComCheckin = new Set(checkinsUsuariosLnk.map(link => link.user_id));

    // Calcular m�dia geral das avalia��es
    const avaliacoesValidas = avaliacoes.filter(a =>
      a.avaliacao !== null &&
      a.avaliacao !== undefined &&
      a.published_at !== null
    );

    const somaAvaliacoes = avaliacoesValidas.reduce((acc, a) => acc + parseFloat(a.avaliacao), 0);
    const mediaGeralAvaliacoes = avaliacoesValidas.length > 0
      ? parseFloat((somaAvaliacoes / avaliacoesValidas.length).toFixed(2))
      : 0;

    return {
      totalUsuariosComAtivacoes: usuariosComCheckin.size,
      totalCheckins: checkins.length,
      totalResgates: resgates.length,
      totalAtivacoes: ativacoes.filter(a => a.published_at !== null).length,
      mediaGeralAvaliacoes: mediaGeralAvaliacoes
    };
  }, [getFilteredData]);

  // Fun��o para obter valores �nicos de uma coluna/campo
  const getUniqueValues = useCallback((tableName, fieldName) => {
    if (!data || !data.tables || !data.tables[tableName]) return [];

    const tableData = data.tables[tableName].data || [];
    const uniqueValues = [...new Set(
      tableData
        .map(row => row[fieldName])
        .filter(value => value !== null && value !== undefined && value !== "")
    )];

    return uniqueValues.sort();
  }, [data]);

  // Fun��o para obter dados de check-ins por ativa��o
  const getCheckInsPorAtivacao = useCallback(() => {
    const filteredData = getFilteredData();
    if (!filteredData) return [];

    const ativacoes = filteredData.ativacoes?.data || [];
    const checkinsAtivacaoLnk = filteredData.checkins_ativacao_lnk?.data || [];
    const avaliacaoAtivacaoLnk = filteredData.avaliacao_de_ativacaos_ativacao_lnk?.data || [];
    const avaliacoes = filteredData.avaliacao_de_ativacaos?.data || [];

    // IMPORTANTE: Filtrar apenas ativações publicadas para evitar duplicações
    const ativacoesPublicadas = ativacoes.filter(a => a.published_at !== null);
    const idsPublicados = new Set(ativacoesPublicadas.map(a => a.id));

    // Agrupar check-ins por ativa��o (apenas das ativações publicadas)
    const checkinsPorAtivacao = {};
    checkinsAtivacaoLnk.forEach(link => {
      const ativacaoId = link.ativacao_id;
      // Só contar check-ins de ativações publicadas
      if (idsPublicados.has(ativacaoId)) {
        if (!checkinsPorAtivacao[ativacaoId]) {
          checkinsPorAtivacao[ativacaoId] = 0;
        }
        checkinsPorAtivacao[ativacaoId]++;
      }
    });

    // Agrupar avalia��es por ativa��o e calcular m�dia
    const mediaAvaliacoesPorAtivacao = {};
    avaliacaoAtivacaoLnk.forEach(link => {
      const ativacaoId = link.ativacao_id;
      const avaliacaoId = link.avaliacao_de_ativacao_id;

      // Só processar avaliações de ativações publicadas
      if (idsPublicados.has(ativacaoId)) {
        // Buscar a avalia��o correspondente
        const avaliacao = avaliacoes.find(a => a.id === avaliacaoId);

        if (avaliacao && avaliacao.avaliacao !== null && avaliacao.avaliacao !== undefined) {
          if (!mediaAvaliacoesPorAtivacao[ativacaoId]) {
            mediaAvaliacoesPorAtivacao[ativacaoId] = {
              soma: 0,
              count: 0
            };
          }
          mediaAvaliacoesPorAtivacao[ativacaoId].soma += parseFloat(avaliacao.avaliacao);
          mediaAvaliacoesPorAtivacao[ativacaoId].count++;
        }
      }
    });

    // Calcular m�dia final para cada ativa��o
    const mediaFinalPorAtivacao = {};
    Object.entries(mediaAvaliacoesPorAtivacao).forEach(([ativacaoId, data]) => {
      mediaFinalPorAtivacao[ativacaoId] = data.count > 0
        ? parseFloat((data.soma / data.count).toFixed(2))
        : 0;
    });

    // Criar array com informa��es das ativa��es
    const chartData = Object.entries(checkinsPorAtivacao).map(([ativacaoId, count]) => {
      const ativacao = ativacoesPublicadas.find(a => a.id === parseInt(ativacaoId));

      return {
        id: parseInt(ativacaoId),
        nome: ativacao?.nome || `Ativa��o ${ativacaoId}`,
        checkins: count,
        mediaAvaliacao: mediaFinalPorAtivacao[ativacaoId] || 0,
        tipo: ativacao?.tipo || null,
        local: ativacao?.local || null,
        pontuacao: ativacao?.pontuacao || 0
      };
    });

    // Ordenar por n�mero de check-ins (decrescente)
    return chartData.sort((a, b) => b.checkins - a.checkins);
  }, [getFilteredData]);

  // Fun��o para obter dados de check-ins por dia
  const getCheckInsPorDia = useCallback(() => {
    const filteredData = getFilteredData();
    if (!filteredData) return [];

    const checkins = filteredData.checkins?.data || [];
    const avaliacoes = filteredData.avaliacao_de_ativacaos?.data || [];
    const avaliacaoUsuarioLnk = filteredData.avaliacao_de_ativacaos_users_permissions_user_lnk?.data || [];
    const checkinsUsuariosLnk = filteredData.checkins_users_permissions_user_lnk?.data || [];

    // Agrupar check-ins por dia
    const checkinsPorDia = {};
    const usuariosPorDia = {}; // Para armazenar usuários que fizeram check-in em cada dia

    checkins.forEach(checkin => {
      if (!checkin.created_at) return;

      // Extrair data no formato YYYY-MM-DD
      const data = new Date(checkin.created_at);
      const dataFormatada = data.toISOString().split('T')[0];

      if (!checkinsPorDia[dataFormatada]) {
        checkinsPorDia[dataFormatada] = 0;
        usuariosPorDia[dataFormatada] = new Set();
      }

      checkinsPorDia[dataFormatada]++;

      // Buscar usuário do check-in
      const linkUsuario = checkinsUsuariosLnk.find(link => link.checkin_id === checkin.id);
      if (linkUsuario) {
        usuariosPorDia[dataFormatada].add(linkUsuario.user_id);
      }
    });

    // Calcular média de avaliações por dia
    const mediaAvaliacoesPorDia = {};
    Object.keys(usuariosPorDia).forEach(data => {
      const usuariosIds = Array.from(usuariosPorDia[data]);

      // Buscar avaliações desses usuários
      const avaliacoesDosDia = [];
      usuariosIds.forEach(userId => {
        const linksAvaliacao = avaliacaoUsuarioLnk.filter(link => link.user_id === userId);
        linksAvaliacao.forEach(link => {
          const avaliacao = avaliacoes.find(a => a.id === link.avaliacao_de_ativacao_id);
          if (avaliacao && avaliacao.avaliacao !== null && avaliacao.avaliacao !== undefined) {
            // Verificar se a avaliação foi feita no mesmo dia
            if (avaliacao.created_at) {
              const dataAvaliacao = new Date(avaliacao.created_at).toISOString().split('T')[0];
              if (dataAvaliacao === data) {
                avaliacoesDosDia.push(parseFloat(avaliacao.avaliacao));
              }
            }
          }
        });
      });

      // Calcular média
      if (avaliacoesDosDia.length > 0) {
        const soma = avaliacoesDosDia.reduce((acc, val) => acc + val, 0);
        mediaAvaliacoesPorDia[data] = parseFloat((soma / avaliacoesDosDia.length).toFixed(2));
      } else {
        mediaAvaliacoesPorDia[data] = 0;
      }
    });

    // Criar array com dados formatados
    const chartData = Object.entries(checkinsPorDia).map(([data, count]) => {
      const dataObj = new Date(data + 'T00:00:00');
      const dataFormatada = dataObj.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });

      return {
        data: data,
        dataFormatada: dataFormatada,
        checkins: count,
        mediaAvaliacao: mediaAvaliacoesPorDia[data] || 0
      };
    });

    // Ordenar por data (crescente)
    return chartData.sort((a, b) => new Date(a.data) - new Date(b.data));
  }, [getFilteredData]);

  // Fun��o para obter picos de hor�rio de check-ins
  const getPicosPorHorario = useCallback((dataSelecionada = null) => {
    const filteredData = getFilteredData();
    if (!filteredData) return { chartData: [], datasDisponiveis: [] };

    const checkins = filteredData.checkins?.data || [];

    // Extrair todas as datas dispon�veis (�nicas)
    const datasDisponiveis = [...new Set(
      checkins
        .filter(checkin => checkin.created_at)
        .map(checkin => new Date(checkin.created_at).toISOString().split('T')[0])
    )].sort();

    // Filtrar check-ins pela data selecionada (se houver)
    let checkinsFiltrados = checkins;
    if (dataSelecionada) {
      checkinsFiltrados = checkins.filter(checkin => {
        if (!checkin.created_at) return false;
        const dataCheckin = new Date(checkin.created_at).toISOString().split('T')[0];
        return dataCheckin === dataSelecionada;
      });
    }

    // Agrupar por hora (0-23)
    const contadorPorHora = {};
    for (let i = 0; i < 24; i++) {
      contadorPorHora[i] = 0;
    }

    checkinsFiltrados.forEach(checkin => {
      if (!checkin.created_at) return;

      const dataHora = new Date(checkin.created_at);
      const hora = dataHora.getHours();
      contadorPorHora[hora]++;
    });

    // Criar array de dados para o gr�fico
    const chartData = Object.entries(contadorPorHora).map(([hora, count]) => ({
      hora: parseInt(hora),
      horaFormatada: `${String(hora).padStart(2, '0')}:00`,
      'check-ins': count
    }));

    return {
      chartData,
      datasDisponiveis: datasDisponiveis.map(data => {
        const dataObj = new Date(data + 'T00:00:00');
        return {
          valor: data,
          label: dataObj.toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
          })
        };
      })
    };
  }, [getFilteredData]);

  // Fun��o para obter dados de resgates por brinde
  const getResgatesPorBrinde = useCallback(() => {
    const filteredData = getFilteredData();
    if (!filteredData) return [];

    const brindes = filteredData.brindes?.data || [];
    const resgatesBrindeLnk = filteredData.resgates_brinde_lnk?.data || [];

    // Agrupar resgates por brinde
    const resgatesPorBrinde = {};
    resgatesBrindeLnk.forEach(link => {
      const brindeId = link.brinde_id;
      if (!resgatesPorBrinde[brindeId]) {
        resgatesPorBrinde[brindeId] = 0;
      }
      resgatesPorBrinde[brindeId]++;
    });

    // Criar array com informa��es dos brindes
    const chartData = Object.entries(resgatesPorBrinde).map(([brindeId, count]) => {
      const brinde = brindes.find(b =>
        b.id === parseInt(brindeId) && b.published_at !== null
      );

      return {
        id: parseInt(brindeId),
        titulo: brinde ? brinde.titulo : `Brinde ${brindeId}`,
        resgates: count,
        pontos: brinde?.pontos || 0,
        estoque: brinde?.estoque || 0
      };
    });

    // Ordenar por n�mero de resgates (decrescente)
    return chartData.sort((a, b) => b.resgates - a.resgates);
  }, [getFilteredData]);

  // Fun��o para obter estat�sticas de filtros
  const getFilterStats = useCallback(() => {
    const allData = data?.tables || {};
    const filteredData = getFilteredData() || {};

    const totalCheckins = allData.checkins?.data?.length || 0;
    const filteredCheckins = filteredData.checkins?.data?.length || 0;

    return {
      total: totalCheckins,
      filtered: filteredCheckins,
      percentage: totalCheckins > 0 ? Math.round((filteredCheckins / totalCheckins) * 100) : 0,
      hasActiveFilters: Object.keys(filters).length > 0
    };
  }, [data, filters, getFilteredData]);

  // Fun��o para obter dados do funil de atividades
  const getFunnelData = useCallback(() => {
    const filteredData = getFilteredData();
    if (!filteredData) return [];

    const usuarios = filteredData.up_users?.data || [];
    const checkins = filteredData.checkins?.data || [];

    // Contar totais de cada tabela
    const totalUsuarios = usuarios.length;
    const totalCheckins = checkins.length;

    // Encontrar o maior valor para calcular as larguras proporcionais
    const maiorValor = Math.max(totalUsuarios, totalCheckins);

    return [
      {
        etapa: 'Usuários Cadastrados',
        quantidade: totalUsuarios,
        percentual: maiorValor > 0 ? Math.round((totalUsuarios / maiorValor) * 100) : 0,
        cor: '#0d6efd'
      },
      {
        etapa: 'Check-ins Realizados',
        quantidade: totalCheckins,
        percentual: maiorValor > 0 ? Math.round((totalCheckins / maiorValor) * 100) : 0,
        cor: '#198754'
      }
    ];
  }, [getFilteredData]);

  // Fun��o para limpar todos os filtros
  const clearFilters = useCallback(() => {
    setFilters({});
  }, []);

  // Wrapper functions para usar as funções de DataRelations com useCallback
  const getCheckInsByUser = useCallback((userId) => DataRelations.getCheckInsByUser(data, userId), [data]);
  const getAtivacoesByCheckin = useCallback((checkinId) => DataRelations.getAtivacoesByCheckin(data, checkinId), [data]);
  const getUsersByAtivacao = useCallback((ativacaoId) => DataRelations.getUsersByAtivacao(data, ativacaoId), [data]);
  const getAtivacoesByEvento = useCallback((eventoId) => DataRelations.getAtivacoesByEvento(data, eventoId), [data]);
  const getEventoByAtivacao = useCallback((ativacaoId) => DataRelations.getEventoByAtivacao(data, ativacaoId), [data]);
  const getClienteByEvento = useCallback((eventoId) => DataRelations.getClienteByEvento(data, eventoId), [data]);
  const getResgatesByUserRelation = useCallback((userId) => DataRelations.getResgatesByUser(data, userId), [data]);
  const getUsersByBrinde = useCallback((brindeId) => DataRelations.getUsersByBrinde(data, brindeId), [data]);
  const getAvaliacoesByAtivacao = useCallback((ativacaoId) => DataRelations.getAvaliacoesByAtivacao(data, ativacaoId), [data]);
  const getAvaliacoesByUser = useCallback((userId) => DataRelations.getAvaliacoesByUser(data, userId), [data]);
  const getNumerosDaSorteByUser = useCallback((userId) => DataRelations.getNumerosDaSorteByUser(data, userId), [data]);
  const getChuteMoedaByUser = useCallback((userId) => DataRelations.getChuteMoedaByUser(data, userId), [data]);
  const getPesquisaExperienciaByUser = useCallback((userId) => DataRelations.getPesquisaExperienciaByUser(data, userId), [data]);
  const getUserProfile = useCallback((userId) => DataRelations.getUserProfile(data, userId), [data]);
  const getAtivacaoStats = useCallback((ativacaoId) => DataRelations.getAtivacaoStats(data, ativacaoId), [data]);
  const getEventoStats = useCallback((eventoId) => DataRelations.getEventoStats(data, eventoId), [data]);

  const value = {
    // Estado
    data,
    loading,
    error,
    filters,

    // A��es
    updateFilters,
    clearFilters,

    // Dados processados
    getFilteredData,
    getMetrics,
    getUniqueValues,
    getCheckInsPorAtivacao,
    getCheckInsPorDia,
    getPicosPorHorario,
    getResgatesPorBrinde,
    getFilterStats,
    getFunnelData,

    // Funções de navegação entre relações (baseadas em relacoes_app.csv)
    getCheckInsByUser,
    getAtivacoesByCheckin,
    getUsersByAtivacao,
    getAtivacoesByEvento,
    getEventoByAtivacao,
    getClienteByEvento,
    getResgatesByUserRelation,
    getUsersByBrinde,
    getAvaliacoesByAtivacao,
    getAvaliacoesByUser,
    getNumerosDaSorteByUser,
    getChuteMoedaByUser,
    getPesquisaExperienciaByUser,
    getUserProfile,
    getAtivacaoStats,
    getEventoStats
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
};
