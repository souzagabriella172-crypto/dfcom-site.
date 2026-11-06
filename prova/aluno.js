/*
 * Página dos alunos – Provas rápidas DFCom/UFF
 *
 * Fluxo:
 *   1. aluno digita código da prova + matrícula → ação "entrar"
 *   2. a página monta as questões, inicia o relógio e passa a registrar
 *      saídas da página (troca de aba, minimizar, outro aplicativo) → ação "saida"
 *   3. aluno envia (ou o tempo acaba e a página envia sozinha) → ação "enviar"
 *
 * O estado da prova fica no sessionStorage: se a página for recarregada sem
 * querer, as respostas marcadas não se perdem (a sessão é revalidada no
 * backend, que recusa quem já enviou ou cuja prova já encerrou).
 */
(function () {
  'use strict';

  var LETRAS = 'ABCDEFGHIJ';          // mesmas letras aceitas pelo backend
  var CHAVE_SESSAO = 'provas_dfcom_sessao';

  var $ = function (id) { return document.getElementById(id); };
  var telaEntrada = $('tela-entrada'), telaProva = $('tela-prova'), telaFim = $('tela-fim');
  var avisoEntrada = $('aviso-entrada'), avisoProva = $('aviso-prova');

  var estado = null;        // sessão atual (ver novaSessao_)
  var relogioTimer = null;
  var autoEnvioFeito = false;

  /* ---------------- utilidades de tela ---------------- */

  function mostrarTela(qual) {
    [telaEntrada, telaProva, telaFim].forEach(function (t) { t.classList.add('escondido'); });
    qual.classList.remove('escondido');
    window.scrollTo(0, 0);
  }

  function aviso(el, texto) {
    if (!texto) { el.classList.remove('mostrar'); el.textContent = ''; return; }
    el.textContent = texto;
    el.classList.add('mostrar');
  }

  function fmtTempo(s) {
    s = Math.max(0, Math.round(s));
    var m = Math.floor(s / 60), r = s % 60;
    return (m < 10 ? '0' : '') + m + ':' + (r < 10 ? '0' : '') + r;
  }

  function fmtNota(n) { return Number(n).toFixed(1).replace('.', ','); }   // 8 → "8,0"

  /* ---------------- sessão ---------------- */

  function novaSessao_(codigo, matricula, dados) {
    return {
      codigo: codigo, matricula: matricula,
      prova: dados.prova, nome: dados.nome,
      questoes: dados.questoes, alternativas: dados.alternativas,
      itens: Array.isArray(dados.itens) ? dados.itens : [],   // enunciados (vazio = cartão-resposta)
      fim: Date.now() + dados.restante_s * 1000,
      respostas: new Array(dados.questoes).fill(''),
      saidas: 0, tempoFora: 0, foraDesde: null
    };
  }

  function salvarSessao() {
    try { sessionStorage.setItem(CHAVE_SESSAO, JSON.stringify(estado)); } catch (x) { /* sem storage: segue sem salvar */ }
  }
  function lerSessao() {
    try { return JSON.parse(sessionStorage.getItem(CHAVE_SESSAO) || 'null'); } catch (x) { return null; }
  }
  function apagarSessao() {
    try { sessionStorage.removeItem(CHAVE_SESSAO); } catch (x) { /* ignora */ }
  }

  /* ---------------- etapa 1: entrar ---------------- */

  $('form-entrada').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var codigo = $('codigo').value.trim().toUpperCase();
    var matricula = $('matricula').value.replace(/\D/g, '');
    if (!codigo || !matricula) { aviso(avisoEntrada, 'Preencha o código da prova e a matrícula.'); return; }
    entrar(codigo, matricula, null);
  });

  function entrar(codigo, matricula, sessaoSalva) {
    aviso(avisoEntrada, '');
    var botao = $('botao-entrar');
    botao.disabled = true; botao.textContent = 'Verificando…';
    ProvasApi.chamar({ acao: 'entrar', codigo: codigo, matricula: matricula }).then(function (r) {
      if (!r.ok) {
        if (sessaoSalva && /já enviou/i.test(r.erro || '')) { apagarSessao(); mostrarFim({ mensagem: 'Suas respostas desta prova já haviam sido enviadas.' }); return; }
        apagarSessao();
        aviso(avisoEntrada, r.erro || 'Não foi possível entrar na prova.');
        return;
      }
      estado = novaSessao_(codigo, matricula, r);
      // recarregou a página no meio da prova: recupera o que já estava marcado
      if (sessaoSalva && sessaoSalva.prova === r.prova && Array.isArray(sessaoSalva.respostas)) {
        estado.respostas = sessaoSalva.respostas.slice(0, r.questoes);
        while (estado.respostas.length < r.questoes) estado.respostas.push('');
        estado.saidas = sessaoSalva.saidas || 0;
        estado.tempoFora = sessaoSalva.tempoFora || 0;
      }
      salvarSessao();
      iniciarProva();
    }).catch(function (x) {
      aviso(avisoEntrada, x.message);
    }).then(function () {
      botao.disabled = false; botao.textContent = 'Entrar na prova';
    });
  }

  /* ---------------- etapa 2: prova ---------------- */

  function iniciarProva() {
    $('prova-nome-aluno').textContent = estado.nome;
    $('prova-id').textContent = estado.prova;
    $('prova-matricula').textContent = estado.matricula;
    $('total-questoes').textContent = estado.questoes;
    montarQuestoes();
    atualizarContagem();
    mostrarTela(telaProva);
    if (estado.saidas > 0) avisarSaidas();
    iniciarRelogio();
    ligarMonitorDeSaida();
  }

  function montarQuestoes() {
    var cont = $('questoes');
    cont.innerHTML = '';
    // enunciados cadastrados na aba Questoes, indexados pelo número da questão
    var porNumero = {};
    estado.itens.forEach(function (it) { porNumero[it.n] = it; });
    var comEnunciado = estado.itens.length > 0;
    cont.classList.toggle('com-enunciado', comEnunciado);

    for (var i = 0; i < estado.questoes; i++) {
      var item = porNumero[i + 1] || null;
      var q = document.createElement('div');
      q.className = 'questao';
      var cab = document.createElement('div');
      cab.className = 'num';
      cab.innerHTML = '<span>Questão ' + (i + 1) + '</span>';
      var limpar = document.createElement('button');
      limpar.type = 'button'; limpar.textContent = 'limpar'; limpar.title = 'Deixar em branco';
      limpar.dataset.q = i;
      limpar.addEventListener('click', function () { marcar(Number(this.dataset.q), ''); });
      cab.appendChild(limpar);
      q.appendChild(cab);

      // enunciado (texto vem da planilha: usa textContent, nunca innerHTML)
      if (item && item.enunciado) {
        var en = document.createElement('div');
        en.className = 'enunciado';
        en.textContent = item.enunciado;
        q.appendChild(en);
      }

      var alts = document.createElement('div');
      var textoAlts = item && item.alternativas.some(function (t) { return t; });
      alts.className = 'alternativas' + (textoAlts ? ' texto' : '');
      for (var a = 0; a < estado.alternativas; a++) {
        var letra = LETRAS.charAt(a), id = 'q' + i + letra;
        var inp = document.createElement('input');
        inp.type = 'radio'; inp.name = 'q' + i; inp.id = id; inp.value = letra;
        inp.checked = estado.respostas[i] === letra;
        inp.dataset.q = i;
        inp.addEventListener('change', function () { marcar(Number(this.dataset.q), this.value); });
        var lab = document.createElement('label');
        lab.htmlFor = id;
        if (textoAlts) {
          var sl = document.createElement('span'); sl.className = 'letra'; sl.textContent = letra;
          var st = document.createElement('span'); st.className = 'txt'; st.textContent = item.alternativas[a] || '';
          lab.appendChild(sl); lab.appendChild(st);
        } else {
          lab.textContent = letra;
        }
        alts.appendChild(inp); alts.appendChild(lab);
      }
      q.appendChild(alts);
      cont.appendChild(q);
    }
  }

  function marcar(i, letra) {
    estado.respostas[i] = letra;
    if (!letra) {
      var marcados = document.querySelectorAll('input[name="q' + i + '"]:checked');
      for (var k = 0; k < marcados.length; k++) marcados[k].checked = false;
    }
    salvarSessao();
    atualizarContagem();
  }

  function atualizarContagem() {
    var n = estado.respostas.filter(function (r) { return r; }).length;
    $('respondidas').textContent = n;
  }

  function iniciarRelogio() {
    var el = $('relogio');
    function tique() {
      var restante = (estado.fim - Date.now()) / 1000;
      el.textContent = fmtTempo(restante);
      el.classList.toggle('pouco', restante <= 60);
      if (restante <= 0 && !autoEnvioFeito) {
        autoEnvioFeito = true;
        clearInterval(relogioTimer);
        aviso(avisoProva, 'O tempo acabou. Enviando as respostas marcadas…');
        enviar(true);
      }
    }
    clearInterval(relogioTimer);
    tique();
    relogioTimer = setInterval(tique, 1000);
  }

  /* ---------------- registro de saídas da página ---------------- */

  var monitorLigado = false;
  function ligarMonitorDeSaida() {
    if (monitorLigado) return;
    monitorLigado = true;
    document.addEventListener('visibilitychange', function () { document.hidden ? saiu() : voltou(); });
    window.addEventListener('blur', saiu);
    window.addEventListener('focus', voltou);
    window.addEventListener('pagehide', function () { if (emProva()) saiu(); });
    window.addEventListener('beforeunload', function (ev) {
      if (emProva()) { ev.preventDefault(); ev.returnValue = ''; }
    });
  }

  function emProva() { return estado && !estado.enviado && !telaProva.classList.contains('escondido'); }

  var dialogoAberto = false;   // confirm() tira o foco da janela; não é saída do aluno
  function saiu() {
    if (!emProva() || estado.foraDesde || dialogoAberto) return;
    estado.foraDesde = Date.now();
    estado.saidas++;
    salvarSessao();
    ProvasApi.avisar({ acao: 'saida', codigo: estado.codigo, matricula: estado.matricula, evento: 'saiu', detalhe: 'saída nº ' + estado.saidas });
  }

  function voltou() {
    if (!estado || !estado.foraDesde) return;
    var fora = (Date.now() - estado.foraDesde) / 1000;
    estado.tempoFora += fora;
    estado.foraDesde = null;
    salvarSessao();
    ProvasApi.avisar({ acao: 'saida', codigo: estado.codigo, matricula: estado.matricula, evento: 'voltou', detalhe: Math.round(fora) + ' s fora' });
    avisarSaidas();
  }

  function avisarSaidas() {
    aviso(avisoProva, 'Registramos que você saiu desta página ' + estado.saidas + (estado.saidas === 1 ? ' vez' : ' vezes') +
      ' (' + Math.round(estado.tempoFora) + ' s no total). O professor é informado.');
  }

  /* ---------------- etapa 3: enviar ---------------- */

  $('form-prova').addEventListener('submit', function (ev) {
    ev.preventDefault();
    enviar(false);
  });

  var enviando = false;
  function enviar(automatico) {
    if (enviando || !estado || estado.enviado) return;
    var brancas = estado.respostas.filter(function (r) { return !r; }).length;
    if (!automatico && brancas > 0) {
      dialogoAberto = true;
      var segue = confirm(brancas + (brancas === 1 ? ' questão está' : ' questões estão') + ' em branco. Enviar mesmo assim?');
      setTimeout(function () { dialogoAberto = false; }, 300);
      if (!segue) return;
    }

    enviando = true;
    var botao = $('botao-enviar');
    botao.disabled = true; botao.textContent = 'Enviando…';
    if (estado.foraDesde) voltou();   // fecha um intervalo "fora" ainda aberto

    var respostas = estado.respostas.map(function (r) { return r || '-'; }).join('');
    ProvasApi.chamar({
      acao: 'enviar', codigo: estado.codigo, matricula: estado.matricula,
      respostas: respostas, saidas: estado.saidas, tempoFora: Math.round(estado.tempoFora)
    }).then(function (r) {
      if (!r.ok) {
        if (/já enviou/i.test(r.erro || '')) { concluir({ mensagem: 'Suas respostas desta prova já haviam sido enviadas.' }); return; }
        if (/tempo da prova terminou|não está aberta/i.test(r.erro || '')) {
          concluir({ mensagem: r.erro, semEnvio: true }); return;
        }
        aviso(avisoProva, r.erro || 'Não foi possível enviar. Tente novamente.');
        enviando = false; botao.disabled = false; botao.textContent = 'Enviar respostas';
        return;
      }
      concluir(r);
    }).catch(function (x) {
      aviso(avisoProva, x.message + ' Suas respostas continuam marcadas; tente enviar de novo.');
      enviando = false; botao.disabled = false; botao.textContent = 'Enviar respostas';
      if (automatico) { autoEnvioFeito = false; }
    });
  }

  function concluir(r) {
    estado.enviado = true;
    clearInterval(relogioTimer);
    apagarSessao();
    mostrarFim(r);
  }

  function mostrarFim(r) {
    $('fim-mensagem').textContent = r.mensagem || 'Respostas recebidas.';
    var nota = $('fim-nota');
    if (typeof r.nota !== 'undefined') {
      nota.textContent = 'Nota: ' + fmtNota(r.nota) + ' — ' + r.acertos + ' de ' + r.questoes + ' acertos.';
      nota.classList.add('mostrar');
    } else {
      nota.classList.remove('mostrar');
    }
    $('fim-detalhe').textContent = r.semEnvio ? 'Nenhuma resposta foi registrada. Procure o professor.' : 'Você já pode fechar esta página.';
    if (r.semEnvio) $('tela-fim').querySelector('h1').textContent = 'Envio não realizado';
    mostrarTela(telaFim);
  }

  /* ---------------- início ---------------- */

  (function iniciar() {
    if (!ProvasApi.configurado()) {
      aviso(avisoEntrada, 'O serviço de provas ainda não foi configurado neste site (prova/config.js).');
      $('botao-entrar').disabled = true;
      return;
    }
    var param = new URLSearchParams(location.search).get('codigo');
    if (param) $('codigo').value = param.toUpperCase();

    var salva = lerSessao();
    if (salva && salva.codigo && salva.matricula && !salva.enviado) {
      $('codigo').value = salva.codigo;
      $('matricula').value = salva.matricula;
      entrar(salva.codigo, salva.matricula, salva);
    }
  })();
})();