/*
 * Painel do professor – Provas rápidas DFCom/UFF
 *
 * Usa as ações do backend:
 *   painel   { chave, [prova] } → lista de provas (com estado) e, para a prova
 *                                 selecionada, a situação de cada aluno
 *   abrir    { chave, prova }   → grava Início = agora na aba Provas
 *   encerrar { chave, prova }   → grava Fim = agora na aba Provas
 *
 * A chave fica apenas no sessionStorage desta aba; nunca é gravada em arquivo.
 */
(function () {
  'use strict';

  var CHAVE_STORAGE = 'provas_dfcom_chave';
  var $ = function (id) { return document.getElementById(id); };

  var chave = '';
  var provaSelecionada = null;   // id da prova escolhida
  var dados = null;              // última resposta da ação "painel"
  var fimSelecionada = null;     // timestamp do fim da prova selecionada (para o relógio)
  var timerAuto = null, timerRelogio = null;

  function aviso(el, texto) {
    if (!texto) { el.classList.remove('mostrar'); el.textContent = ''; return; }
    el.textContent = texto; el.classList.add('mostrar');
  }
  function fmtTempo(s) {
    s = Math.max(0, Math.round(s));
    var m = Math.floor(s / 60), r = s % 60;
    return (m < 10 ? '0' : '') + m + ':' + (r < 10 ? '0' : '') + r;
  }
  function fmtNota(n) { return (n === '' || n == null || isNaN(Number(n))) ? '' : Number(n).toFixed(1).replace('.', ','); }   // 8 → "8,0"
  function agoraHHMMSS() {
    var d = new Date();
    return [d.getHours(), d.getMinutes(), d.getSeconds()].map(function (x) { return (x < 10 ? '0' : '') + x; }).join(':');
  }
  function escapar(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }

  /* ---------------- acesso ---------------- */

  $('form-chave').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var k = $('chave').value.trim();
    if (!k) return;
    var botao = $('botao-chave');
    botao.disabled = true; botao.textContent = 'Verificando…';
    aviso($('aviso-chave'), '');
    ProvasApi.chamar({ acao: 'painel', chave: k }).then(function (r) {
      if (!r.ok) { aviso($('aviso-chave'), r.erro || 'Não foi possível acessar o painel.'); return; }
      chave = k;
      try { sessionStorage.setItem(CHAVE_STORAGE, k); } catch (x) { /* ignora */ }
      $('chave').value = '';
      entrarNoPainel(r);
    }).catch(function (x) {
      aviso($('aviso-chave'), x.message);
    }).then(function () { botao.disabled = false; botao.textContent = 'Entrar'; });
  });

  $('link-sair').addEventListener('click', function (ev) {
    ev.preventDefault();
    chave = ''; dados = null; provaSelecionada = null;
    try { sessionStorage.removeItem(CHAVE_STORAGE); } catch (x) { /* ignora */ }
    clearInterval(timerAuto); clearInterval(timerRelogio);
    $('tela-painel').classList.add('escondido');
    $('link-sair').classList.add('escondido');
    $('tela-chave').classList.remove('escondido');
  });

  function entrarNoPainel(r) {
    $('tela-chave').classList.add('escondido');
    $('tela-painel').classList.remove('escondido');
    $('link-sair').classList.remove('escondido');
    aplicar(r);
    ligarAtualizacaoAutomatica();
  }

  /* ---------------- carregar / atualizar ---------------- */

  var carregando = false;
  function carregar() {
    if (!chave || carregando) return Promise.resolve();
    carregando = true;
    var req = { acao: 'painel', chave: chave };
    if (provaSelecionada) req.prova = provaSelecionada;
    return ProvasApi.chamar(req).then(function (r) {
      if (!r.ok) {
        // não deixa a tabela antiga na tela: o erro precisa ficar visível
        aviso($('aviso-painel'), (r.erro || 'Falha ao atualizar.') + ' A tabela abaixo não foi atualizada.');
        $('area-prova').classList.add('escondido');
        if (/chave inválida/i.test(r.erro || '')) $('link-sair').click();
        return;
      }
      aviso($('aviso-painel'), '');
      aplicar(r);
    }).catch(function (x) {
      aviso($('aviso-painel'), x.message);
    }).then(function () { carregando = false; });
  }

  $('link-atualizar').addEventListener('click', function (ev) { ev.preventDefault(); carregar(); });
  $('auto-atualizar').addEventListener('change', ligarAtualizacaoAutomatica);

  function ligarAtualizacaoAutomatica() {
    clearInterval(timerAuto);
    if (!$('auto-atualizar').checked) return;
    var seg = Number((window.PROVAS_CONFIG || {}).atualizacaoPainelS) || 10;
    timerAuto = setInterval(function () { if (!document.hidden) carregar(); }, Math.max(3, seg) * 1000);
  }

  /* ---------------- desenhar ---------------- */

  function aplicar(r) {
    dados = r;
    $('hora-atualizacao').textContent = agoraHHMMSS();
    // o backend escolhe sozinho a prova aberta quando nenhuma foi pedida
    if (r.prova) provaSelecionada = r.prova;
    desenharProvas(r.provas || []);
    if (provaSelecionada && r.alunos) { desenharProvaSelecionada(r); return; }
    $('area-prova').classList.add('escondido');
    // nenhuma prova aberta e nenhuma escolhida (caso típico: a prova já acabou):
    // seleciona a última cadastrada e busca os resultados dela
    if (!provaSelecionada && r.provas && r.provas.length) {
      provaSelecionada = r.provas[r.provas.length - 1].id;
      carregar();
    }
  }

  function desenharProvas(provas) {
    var cont = $('lista-provas');
    cont.innerHTML = '';
    if (!provas.length) {
      cont.innerHTML = '<p class="discreto">Nenhuma prova cadastrada. Preencha a aba <strong>Provas</strong> da planilha.</p>';
      return;
    }
    provas.forEach(function (p) {
      var el = document.createElement('div');
      el.className = 'prova-item' + (p.id === provaSelecionada ? ' ativa' : '');
      el.innerHTML =
        '<div class="id">' + escapar(p.id) + '</div>' +
        '<div class="meta">código <strong>' + escapar(p.codigo) + '</strong> · ' + escapar(p.questoes) + ' questões · ' + escapar(p.duracao) + ' min' +
        (p.questoesCadastradas ? ' · ' + escapar(p.questoesCadastradas) + ' com enunciado' : ' · cartão-resposta') + '</div>' +
        '<span class="etiqueta ' + escapar(p.estado) + '">' + rotuloEstado(p.estado) + '</span>' +
        (p.estado === 'aberta' ? ' <span class="discreto">' + fmtTempo(p.restante_s) + ' restantes</span>' : '');
      el.addEventListener('click', function () {
        if (provaSelecionada === p.id) return;
        provaSelecionada = p.id;
        carregar();
      });
      cont.appendChild(el);
    });
  }

  function rotuloEstado(e) {
    return e === 'aberta' ? 'Aberta' : e === 'encerrada' ? 'Encerrada' : 'Não aberta';
  }

  function desenharProvaSelecionada(r) {
    var p = (r.provas || []).filter(function (x) { return x.id === r.prova; })[0];
    if (!p) { $('area-prova').classList.add('escondido'); return; }
    $('area-prova').classList.remove('escondido');
    $('sel-id').textContent = p.id;
    $('sel-codigo').textContent = p.codigo;
    $('sel-questoes').textContent = p.questoes;
    $('sel-duracao').textContent = p.duracao;
    $('sel-gabarito').textContent = p.gabarito || '(vazio)';
    var est = $('sel-estado');
    est.textContent = rotuloEstado(p.estado);
    est.className = 'etiqueta ' + p.estado;

    var linkAluno = new URL('index.html?codigo=' + encodeURIComponent(p.codigo), location.href).href;
    $('sel-link').innerHTML = 'link para os alunos: <a href="' + escapar(linkAluno) + '" target="_blank" rel="noopener">' + escapar(linkAluno) + '</a>';

    $('botao-abrir').textContent = p.estado === 'aberta' ? 'Reabrir (reinicia o tempo)' : 'Abrir prova';
    $('botao-encerrar').disabled = p.estado !== 'aberta';

    fimSelecionada = p.estado === 'aberta' ? Date.now() + p.restante_s * 1000 : null;
    atualizarRelogio();
    clearInterval(timerRelogio);
    timerRelogio = setInterval(atualizarRelogio, 1000);

    desenharAlunos(r.alunos || [], p);
  }

  function atualizarRelogio() {
    var el = $('sel-relogio');
    if (!fimSelecionada) { el.textContent = '--:--'; el.classList.remove('pouco'); return; }
    var rest = (fimSelecionada - Date.now()) / 1000;
    el.textContent = fmtTempo(rest);
    el.classList.toggle('pouco', rest <= 60);
    if (rest <= 0) { fimSelecionada = null; carregar(); }
  }

  function desenharAlunos(alunos, p) {
    var tb = $('tabela-alunos').querySelector('tbody');
    tb.innerHTML = '';
    var enviaram = 0, somaNotas = 0, comSaida = 0;
    alunos.forEach(function (a, i) {
      var tr = document.createElement('tr');
      tr.className = a.enviou ? 'enviou' : 'pendente';
      var saidas = Number(a.saidas) || 0;
      if (saidas > 0) comSaida++;
      if (a.enviou) { enviaram++; somaNotas += Number(a.nota) || 0; }
      tr.innerHTML =
        '<td>' + (i + 1) + '</td>' +
        '<td>' + escapar(a.matricula) + '</td>' +
        '<td>' + escapar(a.nome) + '</td>' +
        '<td>' + (a.enviou ? 'Enviou' : '<span class="discreto">aguardando</span>') + '</td>' +
        '<td>' + escapar(a.hora || '') + '</td>' +
        '<td class="mono">' + escapar(a.respostas || '') + '</td>' +
        '<td>' + (a.enviou ? escapar(a.acertos) + '/' + escapar(p.questoes) : '') + '</td>' +
        '<td>' + (a.enviou ? fmtNota(a.nota) : '') + '</td>' +
        '<td>' + (saidas > 0 ? '<span class="saiu">' + saidas + '</span>' : '0') + '</td>' +
        '<td>' + (a.enviou && a.tempoFora !== '' && a.tempoFora != null ? escapar(a.tempoFora) + ' s' : '') + '</td>';
      tb.appendChild(tr);
    });
    $('res-enviaram').textContent = enviaram;
    $('res-faltam').textContent = alunos.length - enviaram;
    $('res-media').textContent = enviaram ? fmtNota(Math.round(10 * somaNotas / enviaram) / 10) : '–';
    $('res-saidas').textContent = comSaida;
  }

  /* ---------------- abrir / encerrar ---------------- */

  function acaoProva(acao, confirmacao) {
    if (!provaSelecionada) return;
    if (!confirm(confirmacao)) return;
    var botoes = [$('botao-abrir'), $('botao-encerrar')];
    botoes.forEach(function (b) { b.disabled = true; });
    ProvasApi.chamar({ acao: acao, chave: chave, prova: provaSelecionada }).then(function (r) {
      if (!r.ok) aviso($('aviso-painel'), r.erro || 'A ação não foi concluída.');
      return carregar();
    }).catch(function (x) {
      aviso($('aviso-painel'), x.message);
    }).then(function () { botoes.forEach(function (b) { b.disabled = false; }); });
  }

  $('botao-abrir').addEventListener('click', function () {
    acaoProva('abrir', 'Abrir a prova "' + provaSelecionada + '" agora? O cronômetro começa neste instante.');
  });
  $('botao-encerrar').addEventListener('click', function () {
    acaoProva('encerrar', 'Encerrar a prova "' + provaSelecionada + '" agora? Quem não enviou terá até 1 minuto de tolerância.');
  });

  /* ---------------- CSV ---------------- */

  $('botao-csv').addEventListener('click', function () {
    if (!dados || !dados.alunos) return;
    var cab = ['Matrícula', 'Nome', 'Enviou', 'Hora', 'Respostas', 'Acertos', 'Nota', 'Saídas da página', 'Tempo fora (s)'];
    var linhas = dados.alunos.map(function (a) {
      return [a.matricula, a.nome, a.enviou ? 'Sim' : 'Não', a.hora || '', a.respostas || '',
              a.enviou ? a.acertos : '', a.enviou ? fmtNota(a.nota) : '', a.saidas || 0, a.enviou ? a.tempoFora : ''];
    });
    var csv = [cab].concat(linhas).map(function (l) {
      return l.map(function (c) { return '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"'; }).join(';');
    }).join('\r\n');
    var blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'prova-' + dados.prova + '.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  });

  /* ---------------- início ---------------- */

  (function iniciar() {
    if (!ProvasApi.configurado()) {
      aviso($('aviso-chave'), 'O serviço de provas ainda não foi configurado neste site (prova/config.js).');
      $('botao-chave').disabled = true;
      return;
    }
    var salva = '';
    try { salva = sessionStorage.getItem(CHAVE_STORAGE) || ''; } catch (x) { /* ignora */ }
    if (salva) {
      chave = salva;
      carregar().then(function () { if (dados) entrarNoPainel(dados); });
    }
  })();
})();