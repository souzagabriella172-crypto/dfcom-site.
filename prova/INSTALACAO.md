# Provas rápidas – DFCom/UFF · instalação e operação

Sistema de provas objetivas rápidas aplicadas em sala. Os alunos respondem em
`https://dfcom-uff.netlify.app/prova/`, as respostas são gravadas numa planilha
Google e o professor acompanha tudo em `https://dfcom-uff.netlify.app/prova/painel.html`.

```
Aluno / professor (navegador)  ──POST JSON──▶  Google Apps Script (App da Web)  ──▶  Planilha "Provas Rápidas — DFCom"
        prova/*.html, *.js                           apps-script/Codigo.gs                 abas Alunos · Provas · Respostas · Eventos
```

## Arquivos

| Arquivo | Para quê |
|---|---|
| `prova/index.html` + `prova/aluno.js` | Página dos alunos: entrar com código + matrícula, responder, relógio, registro de saídas da página, envio (manual ou automático ao fim do tempo). |
| `prova/painel.html` + `prova/painel.js` | Painel do professor: lista de provas, abrir/encerrar, acompanhamento ao vivo por aluno, média, saídas da página, exportação CSV. |
| `prova/api.js` | Camada única de comunicação com o Apps Script (todas as ações e formatos de resposta estão documentados no topo do arquivo). |
| `prova/config.js` | **Único arquivo a editar após publicar o Apps Script**: a URL `/exec`. |
| `prova/prova.css` | Estilo das duas páginas, na paleta do site. |
| `apps-script/Codigo.gs` | Backend. Versão para **projeto Apps Script independente** (abre a planilha por ID). |

O que **não** fica no repositório: a lista de alunos (só na planilha), a chave do
painel (só nas propriedades do script) e o ID da planilha (só dentro do
`Codigo.gs` que está no Apps Script — o do repositório tem o espaço em branco).

---

## 1. Planilha

Planilha Google **Provas Rápidas — DFCom**, com as abas abaixo. Elas podem ser
criadas pela função `prepararPlanilha()` (passo 2) — não é preciso criar à mão.

| Aba | Colunas | Quem preenche |
|---|---|---|
| `Alunos` | Matrícula · Nome | professor, antes da prova |
| `Provas` | Prova · Código · Questões · Alternativas · Gabarito · Duração (min) · Mostrar nota · Início · Fim | professor (Início e Fim são preenchidos pelo painel) |
| `Respostas` | Data/hora · Prova · Matrícula · Nome · Respostas · Acertos · Nota · Saídas da página · Tempo fora (s) | sistema |
| `Eventos` | Data/hora · Prova · Matrícula · Evento · Detalhe | sistema |
| `Questoes` | Prova · Nº · Enunciado · A · B · … · J | professor (opcional, ver abaixo) |

Como cadastrar uma prova na aba `Provas`:

- **Prova**: nome curto, único (ex.: `P1`, `LISTA3`). É o que aparece no painel.
- **Código**: o que os alunos digitam (ex.: `ABC123`). Letras e números, sem espaços.
- **Questões**: quantidade. **Alternativas**: de 2 a 10 (A–J).
- **Gabarito**: uma letra por questão, na ordem (`ABCDE`). `*` anula a questão
  (conta como acerto para todos). Para mudar o gabarito depois de aplicada a prova,
  edite a célula e rode `recalcularNotas()` no Apps Script.
- **Duração (min)**: tempo a partir de "Abrir". **Mostrar nota**: `Sim` para o aluno
  ver a nota logo após enviar; qualquer outra coisa esconde.
- **Início / Fim**: deixe em branco. O botão **Abrir** do painel grava Início; **Encerrar** grava Fim.

A nota é `acertos / questões × 10`, com uma casa decimal.

### Enunciados na tela do aluno (aba `Questoes`, opcional)

Por padrão a página do aluno é um **cartão-resposta**: mostra só "Questão 1, 2, 3…"
com as letras, e as perguntas são apresentadas em sala (quadro, projetor, folha).
Para a pergunta aparecer **na própria página**, cadastre-a na aba `Questoes`:

| Prova | Nº | Enunciado | A | B | C | D | E | … | J |
|---|---|---|---|---|---|---|---|---|---|
| P1 | 1 | Qual é a unidade de viscosidade dinâmica no SI? | Pa·s | N/m | kg/m³ | m²/s | J | | |

- **Prova**: o mesmo nome usado na aba `Provas`. **Nº**: número da questão (1 até o total da prova).
- Só são lidas as colunas de alternativas até a quantidade definida em `Provas` (ex.: 4 alternativas → A a D).
- Pode misturar: questões sem linha nesta aba continuam aparecendo só com as letras.
- O **gabarito continua na aba `Provas`** e nunca é enviado ao navegador do aluno.
- Texto puro; quebras de linha dentro da célula são respeitadas. Sem imagens.

No painel, cada prova mostra "N com enunciado" ou "cartão-resposta".

## 2. Apps Script (projeto independente)

O código usa `SpreadsheetApp.openById()`, então o projeto **não precisa** estar
vinculado à planilha. Ele deve ficar na mesma conta Google que é dona da planilha
(ou numa conta com permissão de edição nela).

1. Em [script.google.com](https://script.google.com), abra o projeto
   **Sistema de Provas DFCom** (ou crie um novo com "Novo projeto").
2. Substitua todo o conteúdo de `Código.gs` pelo arquivo `apps-script/Codigo.gs`
   deste repositório.
3. Na linha `var ID_PLANILHA = 'COLE_O_ID_AQUI';`, cole o ID da planilha — o
   trecho longo da URL entre `/d/` e `/edit`:
   `https://docs.google.com/spreadsheets/d/`**`1AbC…xyz`**`/edit`.
4. Salve. No seletor de funções (ao lado de "Executar"), rode nesta ordem:
   - `testarConexao()` — na primeira vez o Google pede autorização
     ("Revisar permissões" → escolher a conta → "Avançado" → "Acessar … (não seguro)"
     → "Permitir"). No **Registro de execução** deve aparecer o nome da planilha e
     as quatro abas. Se aparecer `NÃO ENCONTRADA`, siga para o item seguinte.
   - `prepararPlanilha()` — cria as abas e cabeçalhos que faltarem e uma prova
     `TESTE` (código `ABC123`) para experimentar.
   - `definirChave()` — antes, escreva a senha do painel em `var CHAVE_NOVA = '';`
     (ex.: `var CHAVE_NOVA = 'minha-senha';`), rode a função e **apague a senha do
     código** em seguida. A chave fica guardada em Configurações do projeto ›
     Propriedades do script, como `CHAVE_PROFESSOR`, e não aparece em lugar nenhum
     do repositório.

## 3. Publicar como App da Web

1. **Implantar › Nova implantação**. Na engrenagem ao lado de "Selecionar o tipo",
   escolha **App da Web** (não "Biblioteca", não "Complemento").
2. Preencha:
   - Executar como: **Eu** (a sua conta). É ela quem grava na planilha; os alunos não precisam de conta Google.
   - Quem pode acessar: **Qualquer pessoa**.
3. **Implantar** e copie a **URL do app da Web**, que termina em `/exec`.
4. Teste colando essa URL no navegador: deve aparecer um texto como
   `{"ok":true,"servico":"Provas DFCom","planilha":"Provas Rápidas — DFCom","abas":["Alunos:ok", …]}`.
   Se aparecer `"ok":false`, a mensagem em `erro` diz o que falta (ID não
   preenchido, aba ausente…).

Dois detalhes que costumam dar problema:

- **A cada alteração no código** é preciso **Implantar › Gerenciar implantações ›
  (lápis) › Versão: Nova versão › Implantar**. Só salvar o código não atualiza a
  URL `/exec`; ela continua servindo a versão antiga.
- A URL é sempre **copiada** de "Gerenciar implantações". Não monte à mão: o ID
  que vai na URL é o **ID da implantação**, diferente do **ID do script** que
  aparece em Configurações do projeto. Ver "Problemas comuns".

## 4. Ligar o site ao Apps Script

Edite `prova/config.js`:

```js
window.PROVAS_CONFIG = {
  url: 'https://script.google.com/macros/s/AKfycb…/exec',   // URL copiada no passo 3
  atualizacaoPainelS: 10
};
```

Essa URL é pública por natureza (os alunos acessam) e pode ficar no arquivo.

**Publicar no Netlify**: em [app.netlify.com](https://app.netlify.com) › site
`dfcom-uff`, use "choose a file or **folder**" e escolha a **pasta inteira do
site** (a que contém `index.html`, `prova/` e `apps-script/`). Antes, no VS Code,
use **File › Save All** — arquivos não salvos sobem vazios. Depois, abra
`https://dfcom-uff.netlify.app/prova/painel.html`, entre com a chave e faça uma
prova de teste com uma matrícula que esteja na aba `Alunos`.

## 5. Aplicando uma prova

1. Preencha `Alunos` (as matrículas são comparadas só pelos dígitos; pontos e traços são ignorados) e cadastre a prova em `Provas`.
2. No painel, clique na prova e em **Abrir prova**. O cronômetro começa naquele instante.
3. Passe aos alunos o código ou o link que o painel mostra (`…/prova/?codigo=ABC123`).
4. O aluno entra com código + matrícula, responde e envia. Se o tempo acabar, a página envia sozinha o que estiver marcado. O backend ainda aceita envios até 60 s depois do fim (rede lenta).
5. O painel atualiza sozinho (intervalo em `config.js`): quem enviou, hora, respostas, acertos, nota, quantas vezes saiu da página e tempo fora. **Baixar CSV** exporta a tabela.
6. **Encerrar prova** termina antes do tempo. **Reabrir** reinicia o cronômetro para quem ainda não enviou; quem já enviou continua bloqueado (uma resposta por matrícula por prova).

Sobre o registro de saídas: a página do aluno conta como "saída" trocar de aba,
minimizar, ir para outro aplicativo ou **recarregar a página**, e mede o tempo
até voltar. Cada saída/volta é enviada na hora (aba `Eventos`, e o painel mostra
ao vivo), e o total vai junto com o envio final (aba `Respostas`). É um indício
para o professor, não uma prova de consulta.

---

## Histórico de verificação

- **23/10/2026** – código testado com um simulador do Apps Script e um navegador
  sem janela (27 verificações do backend, 31 das páginas). Apps Script publicado
  na conta do laboratório; `/exec` respondendo `{"ok":true, …}`; página de provas
  no ar no Netlify.
- **28/10/2026** – confirmado na planilha real: envios chegam à aba `Respostas`
  com nota, acertos e hora; saídas chegam à aba `Eventos`. Corrigido o painel
  (matrículas com zero à esquerda) e adicionada a aba `Questoes`. Painel
  reconhecendo os envios no site real.

## Alterando o sistema

Qualquer mudança passa por dois lugares:

1. **`apps-script/Codigo.gs`** → colar no projeto do Apps Script, salvar e criar
   **nova versão** da implantação (Implantar › Gerenciar implantações › lápis ›
   Nova versão › Implantar). A URL `/exec` não muda.
2. **`prova/*`** → salvar no VS Code (**File › Save All**) e reenviar a pasta do
   site ao Netlify.

## Problemas comuns

**"Não foi possível abrir o arquivo. Verifique o endereço e tente novamente."**
Mensagem do Google Drive, não do script. Causas, da mais comum para a menos:

1. O projeto foi criado em **outra conta Google** (pessoal em vez da do laboratório). Use uma janela anônima, entre só na conta do lab e refaça o projeto nela.
2. URL montada com o **ID do script** em vez do **ID da implantação**. Copie a URL em Implantar › Gerenciar implantações.
3. A implantação não é do tipo **App da Web**, ou foi arquivada/excluída. Crie uma nova.
4. Várias contas Google logadas: o Google abre a URL na conta "padrão". A `/dev` só funciona para a conta dona do script; a `/exec` funciona para qualquer um apenas com acesso "Qualquer pessoa". Teste numa janela anônima.

**O navegador traduz a interface do Apps Script** – "Executar" pode aparecer como "Corrida" e a opção de acesso "Qualquer pessoa" como "Alguém".

**Ao abrir a URL `/exec` aparece a tela de login do Google** – o acesso da implantação não está como "Qualquer pessoa". Gerenciar implantações › lápis › Nova versão › Quem pode acessar: Qualquer pessoa.

**A página do site abre em branco depois de enviar ao Netlify** – os arquivos foram enviados sem salvar no VS Code (bolinha ● nas abas, número no ícone do Explorer). **File › Save All** e reenviar.

**`{"ok":false,"erro":"ID_PLANILHA não foi preenchido…"}`** – preencha a constante e crie **nova versão** da implantação.

**`Aba "Alunos" não existe`** – rode `prepararPlanilha()` ou confira o nome exato das abas (com acento, sem espaços).

**Página diz "O serviço de provas ainda não foi configurado"** – `url` vazia ou que não termina em `/exec` em `prova/config.js`.

**Painel: "Chave inválida"** – a chave digitada difere de `CHAVE_PROFESSOR` (Configurações do projeto › Propriedades do script).

**Aluno: "Esta prova ainda não foi aberta"** – falta clicar em **Abrir** no painel (coluna Início vazia na aba `Provas`), ou o código digitado é de outra prova. Também acontece se alguém **digitou** a data em *Início* à mão: a célula vira texto e o sistema não a reconhece. Apague a célula e use o botão **Abrir**.

**Painel mostra "aguardando" para quem já enviou** – nas versões anteriores a 28/10/2026, matrículas começadas em zero (ex.: `001`) eram gravadas como número (`1`) e não batiam com a aba `Alunos`. Corrigido: a comparação ignora zeros à esquerda e a matrícula passou a ser gravada como texto.

**O site mostra a versão antiga depois de mudar o código do Apps Script** – faltou "Nova versão" em Gerenciar implantações.