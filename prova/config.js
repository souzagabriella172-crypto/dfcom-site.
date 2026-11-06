/*
 * Configuração do sistema de provas rápidas – DFCom/UFF
 *
 * Este é o ÚNICO arquivo que precisa ser editado depois de publicar o
 * Google Apps Script. As páginas prova/index.html (alunos) e
 * prova/painel.html (professor) leem estas opções.
 *
 * url:
 *   Endereço do App da Web publicado no Apps Script. Ele é copiado em
 *   "Implantar › Gerenciar implantações" e tem o formato
 *   https://script.google.com/macros/s/<ID_DA_IMPLANTACAO>/exec
 *   Enquanto estiver vazio, as páginas avisam que o serviço não foi
 *   configurado e não tentam enviar nada.
 *
 *   Esta URL é pública por natureza (os alunos precisam acessá-la) e pode
 *   ficar no repositório. A chave do painel NÃO fica aqui: ela é guardada
 *   nas propriedades do script, no Apps Script.
 *
 * atualizacaoPainelS:
 *   De quantos em quantos segundos o painel do professor recarrega a lista
 *   de alunos automaticamente.
 */
window.PROVAS_CONFIG = {
  url: 'https://script.google.com/macros/s/AKfycbxH3HELCryLpW9xEWHIkBnYNK0XlJ6nGZwZlKeTx-pl7GBiid--QCGcPsTA6qD-uPm0_A/exec',
  atualizacaoPainelS: 10
};