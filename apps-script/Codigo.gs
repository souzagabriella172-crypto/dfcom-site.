/**
 * Provas rápidas – DFCom/UFF  (versão para projeto Apps Script SEPARADO)
 * Recebe as respostas da página https://dfcom-uff.netlify.app/prova/
 * e alimenta o painel do professor.
 *
 * Como este projeto NÃO está vinculado à planilha, ele a abre pelo ID
 * (ID_PLANILHA abaixo). Menus da planilha (onOpen) não funcionam em projeto
 * separado, por isso as rotinas de preparação são executadas pelo editor:
 *   1. testarConexao()      – confere se o script enxerga a planilha e as abas
 *   2. prepararPlanilha()   – cria/completa as abas e cabeçalhos
 *   3. definirChave()       – grava a chave do painel (edite CHAVE_NOVA antes)
 *   4. recalcularNotas()    – após mudar um gabarito
 *
 * Abas da planilha:
 *   Alunos     – Matrícula | Nome
 *   Provas     – Prova | Código | Questões | Alternativas | Gabarito | Duração (min) | Mostrar nota | Início | Fim
 *   Respostas  – Data/hora | Prova | Matrícula | Nome | Respostas | Acertos | Nota | Saídas da página | Tempo fora (s)
 *   Eventos    – Data/hora | Prova | Matrícula | Evento | Detalhe
 */

// >>> Cole aqui o ID da planilha "Provas Rápidas — DFCom":
// é o trecho da URL entre /d/ e /edit, ex.: https://docs.google.com/spreadsheets/d/ESTE_TRECHO/edit
var ID_PLANILHA = 'COLE_O_ID_AQUI';

var ABA_ALUNOS = 'Alunos', ABA_PROVAS = 'Provas', ABA_RESP = 'Respostas', ABA_EVT = 'Eventos';
var CAB = {
  Alunos: ['Matrícula', 'Nome'],
  Provas: ['Prova', 'Código', 'Questões', 'Alternativas', 'Gabarito', 'Duração (min)', 'Mostrar nota', 'Início', 'Fim'],
  Respostas: ['Data/hora', 'Prova', 'Matrícula', 'Nome', 'Respostas', 'Acertos', 'Nota', 'Saídas da página', 'Tempo fora (s)'],
  Eventos: ['Data/hora', 'Prova', 'Matrícula', 'Evento', 'Detalhe']
};
var TOLERANCIA_S = 60;   // envios aceitos até 1 min depois do fim (rede lenta)
var LETRAS = 'ABCDEFGHIJ';

/* ---------------- acesso à planilha ---------------- */

var planilhaCache_ = null;
function ss_() {
  if (!planilhaCache_) {
    if (!ID_PLANILHA || ID_PLANILHA === 'COLE_O_ID_AQUI') throw new Error('ID_PLANILHA não foi preenchido no Codigo.gs.');
    planilhaCache_ = SpreadsheetApp.openById(ID_PLANILHA);
  }
  return planilhaCache_;
}
function aba_(nome) {
  var sh = ss_().getSheetByName(nome);
  if (!sh) throw new Error('Aba "' + nome + '" não existe. Rode prepararPlanilha().');
  return sh;
}

/* ---------------- rotinas executadas pelo editor ---------------- */

function testarConexao() {
  var ss = ss_();
  Logger.log('Planilha: ' + ss.getName() + '  (' + ss.getUrl() + ')');
  Object.keys(CAB).forEach(function (nome) {
    var sh = ss.getSheetByName(nome);
    Logger.log(nome + ': ' + (sh ? sh.getLastRow() + ' linha(s)' : 'NÃO ENCONTRADA'));
  });
  var k = PropertiesService.getScriptProperties().getProperty('CHAVE_PROFESSOR');
  Logger.log('Chave do painel: ' + (k ? 'definida' : 'NÃO definida — rode definirChave()'));
  Logger.log('Provas cadastradas: ' + JSON.stringify(lerProvas_().map(function (p) { return p.id + '/' + p.codigo + ' ' + situacao_(p).estado; })));
}

function prepararPlanilha() {
  var ss = ss_();
  Object.keys(CAB).forEach(function (nome) {
    var sh = ss.getSheetByName(nome) || ss.insertSheet(nome);
    if (sh.getLastRow() === 0) {
      sh.appendRow(CAB[nome]);
      sh.getRange(1, 1, 1, CAB[nome].length).setFontWeight('bold');
      sh.setFrozenRows(1);
    }
  });
  ss.getSheetByName(ABA_ALUNOS).getRange('A:A').setNumberFormat('@');
  ss.getSheetByName(ABA_RESP).getRange('C:C').setNumberFormat('@');
  ss.getSheetByName(ABA_EVT).getRange('C:C').setNumberFormat('@');
  var p = ss.getSheetByName(ABA_PROVAS);
  p.getRange('B:B').setNumberFormat('@');
  p.getRange('E:E').setNumberFormat('@');
  if (p.getLastRow() === 1) p.appendRow(['TESTE', 'ABC123', 5, 5, 'ABCDE', 5, 'Sim', '', '']);
  Logger.log('Planilha preparada.');
}

// Edite o valor abaixo, rode definirChave() e depois apague o valor daqui.
var CHAVE_NOVA = '';
function definirChave() {
  var k = String(CHAVE_NOVA || '').trim();
  if (!k) throw new Error('Preencha CHAVE_NOVA antes de rodar definirChave().');
  PropertiesService.getScriptProperties().setProperty('CHAVE_PROFESSOR', k);
  Logger.log('Chave gravada. Agora apague o valor de CHAVE_NOVA no código.');
}

function recalcularNotas() {
  var provas = {};
  lerProvas_().forEach(function (p) { provas[p.id] = p; });
  var sh = aba_(ABA_RESP);
  if (sh.getLastRow() < 2) return;
  var rg = sh.getRange(2, 5, sh.getLastRow() - 1, 3), v = rg.getValues(), ids = sh.getRange(2, 2, sh.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < v.length; i++) {
    var p = provas[String(ids[i][0])];
    if (p) { var c = corrigir_(String(v[i][0]), p.gabarito, p.questoes); v[i][1] = c.acertos; v[i][2] = c.nota; }
  }
  rg.setValues(v);
}

/* ---------------- entrada web ---------------- */

function doGet() {
  try {
    var ss = ss_();
    return saida_({ ok: true, servico: 'Provas DFCom', planilha: ss.getName(),
                    abas: Object.keys(CAB).map(function (n) { return n + ':' + (ss.getSheetByName(n) ? 'ok' : 'FALTA'); }) });
  } catch (x) {
    return saida_({ ok: false, servico: 'Provas DFCom', erro: x.message });
  }
}

function doPost(e) {
  var req;
  try { req = JSON.parse(e.postData.contents); } catch (x) { return saida_({ ok: false, erro: 'Requisição inválida.' }); }
  try {
    switch (req.acao) {
      case 'entrar':   return saida_(entrar_(req));
      case 'enviar':   return saida_(comTrava_(function () { return enviar_(req); }));
      case 'saida':    return saida_(registrarEvento_(req));
      case 'painel':   return saida_(painel_(req));
      case 'abrir':    return saida_(comTrava_(function () { return abrirFechar_(req, true); }));
      case 'encerrar': return saida_(comTrava_(function () { return abrirFechar_(req, false); }));
      default:         return saida_({ ok: false, erro: 'Ação desconhecida.' });
    }
  } catch (x) {
    return saida_({ ok: false, erro: 'Erro no servidor: ' + x.message });
  }
}

/* ---------------- ações dos alunos ---------------- */

function entrar_(req) {
  var prova = provaPorCodigo_(req.codigo);
  if (!prova) return { ok: false, erro: 'Código de prova inválido.' };
  var st = situacao_(prova);
  if (st.estado !== 'aberta') return { ok: false, erro: st.estado === 'fechada' ? 'Esta prova ainda não foi aberta.' : 'Esta prova já foi encerrada.' };
  var aluno = alunoPorMatricula_(req.matricula);
  if (!aluno) return { ok: false, erro: 'Matrícula não encontrada nesta turma.' };
  if (jaEnviou_(prova.id, aluno.matricula)) return { ok: false, erro: 'Você já enviou esta prova.' };
  return {
    ok: true, prova: prova.id, nome: aluno.nome,
    questoes: prova.questoes, alternativas: prova.alternativas,
    restante_s: st.restante_s
  };
}

function enviar_(req) {
  var prova = provaPorCodigo_(req.codigo);
  if (!prova) return { ok: false, erro: 'Código de prova inválido.' };
  var st = situacao_(prova);
  if (st.estado === 'fechada') return { ok: false, erro: 'Esta prova não está aberta.' };
  if (st.estado === 'encerrada' && st.atraso_s > TOLERANCIA_S) return { ok: false, erro: 'O tempo da prova terminou.' };
  var aluno = alunoPorMatricula_(req.matricula);
  if (!aluno) return { ok: false, erro: 'Matrícula não encontrada nesta turma.' };
  if (jaEnviou_(prova.id, aluno.matricula)) return { ok: false, erro: 'Você já enviou esta prova.' };

  var resp = String(req.respostas || '').toUpperCase().replace(/[^A-J-]/g, '');
  resp = (resp + Array(prova.questoes + 1).join('-')).slice(0, prova.questoes);
  var c = corrigir_(resp, prova.gabarito, prova.questoes);
  aba_(ABA_RESP).appendRow([
    new Date(), prova.id, aluno.matricula, aluno.nome, resp, c.acertos, c.nota,
    Number(req.saidas) || 0, Math.round(Number(req.tempoFora) || 0)
  ]);
  var r = { ok: true, mensagem: 'Respostas recebidas.' };
  if (prova.mostrarNota) { r.nota = c.nota; r.acertos = c.acertos; r.questoes = prova.questoes; }
  return r;
}

function registrarEvento_(req) {
  var prova = provaPorCodigo_(req.codigo);
  if (!prova) return { ok: false };
  aba_(ABA_EVT).appendRow([
    new Date(), prova.id, String(req.matricula || '').trim(), String(req.evento || '').slice(0, 30), String(req.detalhe || '').slice(0, 200)
  ]);
  return { ok: true };
}

/* ---------------- ações do professor ---------------- */

function painel_(req) {
  if (!chaveOk_(req.chave)) return { ok: false, erro: 'Chave inválida.' };
  var provas = lerProvas_().map(function (p) {
    var st = situacao_(p);
    return { id: p.id, codigo: p.codigo, questoes: p.questoes, gabarito: p.gabarito, duracao: p.duracao,
             estado: st.estado, restante_s: st.restante_s };
  });
  var r = { ok: true, provas: provas, agora: new Date().toISOString() };
  var sel = req.prova || (provas.filter(function (p) { return p.estado === 'aberta'; })[0] || {}).id;
  if (sel) {
    var alunos = lerAlunos_();
    var enviados = {};
    linhas_(ABA_RESP).forEach(function (l) {
      if (String(l[1]) === sel && !enviados[normMat_(l[2])]) {
        enviados[normMat_(l[2])] = { matricula: normMat_(l[2]), nome: l[3], respostas: l[4], acertos: l[5], nota: l[6],
                                   saidas: l[7], tempoFora: l[8], hora: fmtHora_(l[0]) };
      }
    });
    var saidasAoVivo = {};
    linhas_(ABA_EVT).forEach(function (l) {
      if (String(l[1]) === sel && l[3] === 'saiu') saidasAoVivo[normMat_(l[2])] = (saidasAoVivo[normMat_(l[2])] || 0) + 1;
    });
    r.prova = sel;
    r.alunos = alunos.map(function (a) {
      var e = enviados[a.matricula];
      return e ? Object.assign({ enviou: true }, e)
               : { enviou: false, matricula: a.matricula, nome: a.nome, saidas: saidasAoVivo[a.matricula] || 0 };
    });
  }
  return r;
}

function abrirFechar_(req, abrir) {
  if (!chaveOk_(req.chave)) return { ok: false, erro: 'Chave inválida.' };
  var sh = aba_(ABA_PROVAS);
  var dados = sh.getDataRange().getValues();
  for (var i = 1; i < dados.length; i++) {
    if (String(dados[i][0]).trim() === String(req.prova)) {
      if (abrir) { sh.getRange(i + 1, 8, 1, 2).setValues([[new Date(), '']]); }
      else { sh.getRange(i + 1, 9).setValue(new Date()); }
      return { ok: true };
    }
  }
  return { ok: false, erro: 'Prova não encontrada.' };
}

/* ---------------- utilitários ---------------- */

function corrigir_(resp, gabarito, n) {
  var acertos = 0;
  for (var i = 0; i < n; i++) {
    var g = gabarito.charAt(i);
    if (g === '*' || (g && g !== '-' && resp.charAt(i) === g)) acertos++;   // '*' = questão anulada
  }
  return { acertos: acertos, nota: Math.round(100 * acertos / n) / 10 };
}

function situacao_(p) {
  var agora = Date.now();
  if (!(p.inicio instanceof Date)) return { estado: 'fechada', restante_s: 0 };
  var fimPrevisto = p.inicio.getTime() + p.duracao * 60000;
  var fim = (p.fim instanceof Date) ? Math.min(p.fim.getTime(), fimPrevisto) : fimPrevisto;
  if (agora < fim) return { estado: 'aberta', restante_s: Math.round((fim - agora) / 1000) };
  return { estado: 'encerrada', restante_s: 0, atraso_s: Math.round((agora - fim) / 1000) };
}

function lerProvas_() {
  return linhas_(ABA_PROVAS).filter(function (l) { return String(l[0]).trim(); }).map(function (l) {
    var n = parseInt(l[2], 10) || 0;
    return {
      id: String(l[0]).trim(), codigo: String(l[1]).trim().toUpperCase(), questoes: n,
      alternativas: Math.min(10, Math.max(2, parseInt(l[3], 10) || 5)),
      gabarito: String(l[4]).toUpperCase().replace(/[^A-J*-]/g, ''),
      duracao: Number(l[5]) || 5, mostrarNota: /^s/i.test(String(l[6])),
      inicio: l[7], fim: l[8]
    };
  });
}

function provaPorCodigo_(codigo) {
  var c = String(codigo || '').trim().toUpperCase();
  if (!c) return null;
  var lista = lerProvas_().filter(function (p) { return p.codigo === c; });
  return lista.filter(function (p) { return situacao_(p).estado === 'aberta'; })[0] || lista[0] || null;
}

function lerAlunos_() {
  return linhas_(ABA_ALUNOS).filter(function (l) { return String(l[0]).trim(); })
    .map(function (l) { return { matricula: normMat_(l[0]), nome: String(l[1]).trim() }; });
}

function alunoPorMatricula_(m) {
  var alvo = normMat_(m);
  return lerAlunos_().filter(function (a) { return a.matricula === alvo; })[0] || null;
}

function jaEnviou_(provaId, matricula) {
  return linhas_(ABA_RESP).some(function (l) { return String(l[1]) === provaId && normMat_(l[2]) === matricula; });
}

function normMat_(m) { return String(m || '').replace(/\D/g, ''); }

function linhas_(aba) {
  var sh = ss_().getSheetByName(aba);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
}

function chaveOk_(chave) {
  var k = PropertiesService.getScriptProperties().getProperty('CHAVE_PROFESSOR');
  return !!k && String(chave || '') === k;
}

function comTrava_(fn) {
  var trava = LockService.getScriptLock();
  trava.waitLock(25000);
  try { return fn(); } finally { trava.releaseLock(); }
}

function fmtHora_(d) {
  return (d instanceof Date) ? Utilities.formatDate(d, 'America/Sao_Paulo', 'HH:mm:ss') : '';
}

function saida_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}