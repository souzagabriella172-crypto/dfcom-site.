/*
 * Camada de comunicação com o Google Apps Script – DFCom/UFF
 *
 * Todas as páginas falam com o backend por aqui. O backend (apps-script/
 * Codigo.gs) recebe um POST com um JSON no corpo e devolve um JSON com,
 * no mínimo, o campo "ok". Quando "ok" é false, vem também "erro".
 *
 * Ações aceitas pelo backend e o que cada uma espera/retorna:
 *   entrar   { codigo, matricula }                     → { ok, prova, nome, questoes, alternativas, restante_s }
 *   enviar   { codigo, matricula, respostas, saidas, tempoFora }
 *                                                      → { ok, mensagem, [nota, acertos, questoes] }
 *   saida    { codigo, matricula, evento, detalhe }    → { ok }
 *   painel   { chave, [prova] }                        → { ok, provas[], agora, [prova, alunos[]] }
 *   abrir    { chave, prova }                          → { ok }
 *   encerrar { chave, prova }                          → { ok }
 *
 * Por que o Content-Type é text/plain e não application/json:
 *   o Apps Script não responde à "pré-verificação" (preflight OPTIONS) que o
 *   navegador faz antes de um POST com application/json vindo de outro site.
 *   Com text/plain o navegador envia o POST direto, o Apps Script lê o corpo
 *   em e.postData.contents normalmente e a resposta final (depois do
 *   redirecionamento interno do Google) já vem com permissão de CORS.
 */
(function () {
  'use strict';

  function urlServico() {
    var cfg = window.PROVAS_CONFIG || {};
    return String(cfg.url || '').trim();
  }

  function servicoConfigurado() {
    return /^https:\/\/.+\/exec$/.test(urlServico()) || /^http:\/\/(localhost|127\.0\.0\.1)/.test(urlServico());
  }

  /* Chama o backend e devolve uma Promise com o JSON de resposta.
     Lança Error com mensagem legível em caso de falha de rede/formato. */
  function chamar(dados) {
    if (!servicoConfigurado()) {
      return Promise.reject(new Error('O endereço do serviço de provas não foi configurado (prova/config.js).'));
    }
    return fetch(urlServico(), {
      method: 'POST',
      body: JSON.stringify(dados),
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      redirect: 'follow',
      cache: 'no-store'
    }).then(function (r) {
      return r.text().then(function (texto) {
        var json;
        try { json = JSON.parse(texto); }
        catch (x) { throw new Error('O serviço respondeu em um formato inesperado (verifique a URL em config.js e a implantação do Apps Script).'); }
        if (!json || typeof json.ok === 'undefined') throw new Error('Resposta incompleta do serviço.');
        return json;
      });
    }, function () {
      throw new Error('Não foi possível falar com o serviço. Verifique a conexão com a internet.');
    });
  }

  /* Envio "dispara e esquece", usado quando o aluno sai da página.
     navigator.sendBeacon continua o envio mesmo se a aba for fechada. */
  function avisar(dados) {
    if (!servicoConfigurado()) return;
    var corpo = JSON.stringify(dados);
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(urlServico(), new Blob([corpo], { type: 'text/plain;charset=utf-8' }))) return;
    } catch (x) { /* cai no fetch abaixo */ }
    try {
      fetch(urlServico(), { method: 'POST', body: corpo, headers: { 'Content-Type': 'text/plain;charset=utf-8' }, keepalive: true, redirect: 'follow' })
        .catch(function () {});
    } catch (x) { /* sem rede: ignora, o total segue no envio final */ }
  }

  window.ProvasApi = { chamar: chamar, avisar: avisar, configurado: servicoConfigurado, url: urlServico };
})();