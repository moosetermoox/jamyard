/**
 * Activity language: the fixed labels students and the projector see
 * ("Submit", "Show the message") in the language the activity is written
 * in. Teacher content is already in whatever language the teacher typed;
 * this covers the chrome around it.
 *
 * Three pure pieces, all exported for tests:
 *   - detectLanguage(text)      stopword heuristic over the activity's own
 *                               text (no AI call, deterministic, cheap)
 *   - resolveLanguage(config)   explicit `config.language` wins; "auto" or
 *                               absent falls back to detection; unknown
 *                               text stays English
 *   - translate(lang, key)      English label in, translated label out
 *                               (falls back to the key, so a missing
 *                               string can never blank a button)
 *
 * The tables are keyed by the ENGLISH label so client code reads as
 * plain English (`t('Submit')`) and every language table must carry the
 * same key set (drift-guarded by tests/engine/i18n.test.js).
 */

export const LANGUAGES = Object.freeze({
  en: 'English',
  es: 'Spanish (Español)',
  fr: 'French (Français)',
  de: 'German (Deutsch)',
  pt: 'Portuguese (Português)',
  it: 'Italian (Italiano)'
});

export const LANGUAGE_CODES = Object.freeze(Object.keys(LANGUAGES));
export const AUTO = 'auto';

// Distinctive, high-frequency function words per language. Shared words
// ("de" in Spanish, French AND Portuguese) score for every language they
// belong to; the distinctive ones ("y", "et", "und", "não", "è") break the
// tie. Lowercase, accent-sensitive tokens.
const STOPWORDS = {
  en: ['the', 'and', 'is', 'are', 'you', 'your', 'what', 'with', 'for', 'to', 'of', 'this', 'that', 'it', 'on', 'in', 'be', 'do', 'will', 'one', 'have', 'from', 'about', 'which', 'who', 'how', 'why', 'each', 'everyone'],
  es: ['el', 'la', 'los', 'las', 'y', 'es', 'que', 'de', 'un', 'una', 'para', 'con', 'por', 'en', 'del', 'al', 'su', 'tu', 'qué', 'cómo', 'cuál', 'más', 'no', 'se', 'lo', 'como', 'este', 'esta', 'son', 'hay', 'escribe', 'sobre', 'tus', 'sus'],
  fr: ['le', 'la', 'les', 'des', 'et', 'est', 'une', 'un', 'pour', 'vous', 'tu', 'dans', 'que', 'qui', 'avec', 'du', 'de', 'ce', 'cette', 'sur', 'pas', 'ne', 'il', 'elle', 'nous', 'votre', 'ton', 'ta', 'tes', 'quel', 'quelle', 'plus', 'sont', 'écris', 'à'],
  de: ['der', 'die', 'das', 'und', 'ist', 'nicht', 'ein', 'eine', 'mit', 'für', 'sie', 'wir', 'ich', 'du', 'ihr', 'was', 'wie', 'auf', 'zu', 'den', 'dem', 'des', 'im', 'von', 'sind', 'oder', 'auch', 'wird', 'welche', 'euer', 'eure', 'schreibe', 'über', 'dein', 'deine'],
  pt: ['o', 'os', 'as', 'a', 'e', 'é', 'uma', 'um', 'para', 'com', 'não', 'você', 'que', 'do', 'da', 'dos', 'das', 'em', 'no', 'na', 'seu', 'sua', 'mais', 'como', 'qual', 'são', 'ao', 'pelo', 'pela', 'também', 'escreva', 'sobre', 'vocês'],
  it: ['il', 'lo', 'gli', 'le', 'la', 'e', 'è', 'una', 'un', 'per', 'con', 'non', 'che', 'di', 'del', 'della', 'dei', 'delle', 'sono', 'nel', 'nella', 'come', 'quale', 'più', 'anche', 'tuo', 'tua', 'vostro', 'questo', 'questa', 'scrivi', 'su', 'cosa']
};

const STOPSETS = Object.fromEntries(
  Object.entries(STOPWORDS).map(([code, words]) => [code, new Set(words)])
);

// Minimum distinctive hits before we trust a non-English guess. Short
// prompts ("Escribe una palabra") clear it; a stray "la" in English does not.
const MIN_HITS = 3;

/**
 * @param {string} text
 * @returns {string} a language code; 'en' when nothing else is clearly ahead
 */
export function detectLanguage(text) {
  if (typeof text !== 'string' || !text.trim()) return 'en';
  const tokens = text
    .replace(/\{\{[^}]*\}\}/g, ' ')
    .toLowerCase()
    .split(/[^\p{L}]+/u)
    .filter(Boolean);
  if (tokens.length === 0) return 'en';
  const scores = {};
  for (const code of Object.keys(STOPSETS)) scores[code] = 0;
  for (const tok of tokens) {
    for (const code of Object.keys(STOPSETS)) {
      if (STOPSETS[code].has(tok)) scores[code] += 1;
    }
  }
  let best = 'en';
  let bestScore = -1;
  for (const code of Object.keys(scores)) {
    if (code === 'en') continue;
    if (scores[code] > bestScore) { best = code; bestScore = scores[code]; }
  }
  if (bestScore < MIN_HITS || bestScore <= scores.en) return 'en';
  return best;
}

// The words the class will read: teacher-authored text on the phases plus
// the activity's name and description. Field names, ids, refs and single
// tokens are skipped (no spaces = not prose); {{tokens}} are stripped by
// the detector. The recipe provenance stamp is never prose.
export function configText(config) {
  if (!config || typeof config !== 'object') return '';
  const parts = [];
  const seen = new Set();
  const walk = (value) => {
    if (typeof value === 'string') {
      if (value.includes(' ')) parts.push(value);
      return;
    }
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) { value.forEach(walk); return; }
    for (const [key, v] of Object.entries(value)) {
      if (key === 'recipe' || key === 'image' || key === 'video' || key === 'drawing') continue;
      walk(v);
    }
  };
  if (typeof config.name === 'string') parts.push(config.name);
  if (typeof config.description === 'string') parts.push(config.description);
  walk(config.phases);
  return parts.join('\n');
}

export function isSupportedLanguage(code) {
  return typeof code === 'string' && LANGUAGE_CODES.includes(code);
}

/**
 * @param {object} config a game config
 * @returns {string} the language code the room should run in
 */
export function resolveLanguage(config) {
  if (config && isSupportedLanguage(config.language)) return config.language;
  return detectLanguage(configText(config));
}

/**
 * @param {string} lang language code
 * @param {string} key the English label
 * @returns {string} the label in that language, or the key itself
 */
export function translate(lang, key) {
  const table = STRINGS[lang];
  if (!table) return key;
  return Object.prototype.hasOwnProperty.call(table, key) ? table[key] : key;
}

/** The whole table for a language (what the screens receive), {} for English. */
export function stringsFor(lang) {
  return STRINGS[lang] || {};
}

// ---------------------------------------------------------------------
// The strings. Keys are the English labels exactly as the screens use
// them. Grouped: continue/close button labels (server-side,
// engine/phases/continue-labels.js), projector chrome, student screen.
// ---------------------------------------------------------------------

export const STRINGS = {
  es: {
    // Continue / close labels
    'Show the message': 'Mostrar el mensaje',
    'Send the question to students': 'Enviar la pregunta a los estudiantes',
    'Next question': 'Siguiente pregunta',
    'Start the first question': 'Empezar con la primera pregunta',
    'Start the voting': 'Empezar la votación',
    'Reveal the results': 'Revelar los resultados',
    'Start revealing': 'Empezar a revelar',
    'Review before the class sees it': 'Revisar antes de que la clase lo vea',
    'Show the standings': 'Mostrar la clasificación',
    'Crown the winner': 'Coronar al ganador',
    'Start ranking': 'Empezar a ordenar',
    'Start rating': 'Empezar a calificar',
    'Start guessing': 'Empezar a adivinar',
    'Start matching': 'Empezar a emparejar',
    'Start sorting': 'Empezar a clasificar',
    'Open the buzzers': 'Abrir los pulsadores',
    'Start the pair work': 'Empezar el trabajo en parejas',
    'Start counting together': 'Empezar a contar juntos',
    'Start the round': 'Empezar la ronda',
    'Start the relay': 'Empezar el relevo',
    'Split into teams': 'Dividir en equipos',
    'Open the bets': 'Abrir las apuestas',
    'Start the checklist': 'Empezar la lista de tareas',
    'Run the elimination': 'Hacer la eliminación',
    'Let the AI work': 'Dejar que la IA trabaje',
    'Start the first round': 'Empezar la primera ronda',
    'Finish up': 'Terminar',
    'Continue': 'Continuar',
    'End the ratings': 'Cerrar las calificaciones',
    'Lock in the guesses': 'Fijar las respuestas',
    'Reveal the answers': 'Revelar las respuestas',
    'End work time': 'Terminar el tiempo de trabajo',
    // Projector chrome
    'Start!': '¡Empezar!',
    'Waiting for students to join...': 'Esperando a que los estudiantes se unan...',
    "Who's in": 'Quién está',
    'Players are answering...': 'Los jugadores están respondiendo...',
    'Close Submissions': 'Cerrar respuestas',
    'AI is processing...': 'La IA está trabajando...',
    'Voting in progress...': 'Votación en curso...',
    'Close Voting': 'Cerrar votación',
    'Round Results': 'Resultados de la ronda',
    'End Session': 'Terminar la sesión',
    'Leaderboard': 'Clasificación',
    'Reveal Next': 'Revelar el siguiente',
    'Teams': 'Equipos',
    'Confirm Teams': 'Confirmar equipos',
    'Close Ranking': 'Cerrar el orden',
    'Reveal the Answers': 'Revelar las respuestas',
    'Reveal the Answer': 'Revelar la respuesta',
    'End Work Time': 'Terminar el tiempo de trabajo',
    'Close Merging': 'Cerrar la puesta en común',
    'Move On': 'Seguir',
    'Finish round': 'Terminar la ronda',
    'Listen for the question!': '¡Escucha la pregunta!',
    'Count together, one voice at a time': 'Cuenten juntos, una voz a la vez',
    '✓ Correct': '✓ Correcto',
    '✗ Wrong': '✗ Incorrecto',
    // Student screen
    'Join In': 'Únete',
    'Room code': 'Código de la sala',
    'Each letter you type fills a block.': 'Cada letra que escribes llena un bloque.',
    'Your name': 'Tu nombre',
    'First name': 'Nombre',
    'Leave blank to join as Anonymous.': 'Déjalo en blanco para entrar como Anónimo.',
    'Join': 'Entrar',
    "You're in!": '¡Ya estás dentro!',
    'Answer the question:': 'Responde la pregunta:',
    '↩ Undo': '↩ Deshacer',
    '✕ Clear': '✕ Borrar',
    'Type your answer here...': 'Escribe tu respuesta aquí...',
    'Submit': 'Enviar',
    'Answer submitted!': '¡Respuesta enviada!',
    "Reading everyone's answers...": 'Leyendo las respuestas de todos...',
    'The Result:': 'El resultado:',
    'Vote!': '¡Vota!',
    'Vote submitted!': '¡Voto enviado!',
    'Which is better?': '¿Cuál es mejor?',
    'Pick your favorite!': '¡Elige tu favorito!',
    'Elimination Results': 'Resultados de la eliminación',
    'Submit Ranking': 'Enviar el orden',
    'Submit Matches': 'Enviar las parejas',
    'Submit Sorting': 'Enviar la clasificación',
    'Write your shared answer together...': 'Escriban juntos su respuesta compartida...',
    'We agree, submit': 'Estamos de acuerdo, enviar',
    'Take the pen': 'Tomar el lápiz',
    'Say the next number, when it feels right.': 'Di el siguiente número cuando lo sientas.',
    'Your guess': 'Tu respuesta',
    'Submit Guess': 'Enviar respuesta',
    'Bet amount:': 'Cantidad apostada:',
    'Place Wager': 'Apostar',
    'Add your part...': 'Añade tu parte...',
    'Submitted! Waiting...': '¡Enviado! Esperando...',
    '✓ Got It!': '✓ ¡Acertado!',
    'Skip': 'Saltar',
    'Submit Ratings': 'Enviar calificaciones',
    'Pass this one': 'Pasar esta',
    'Thanks for playing!': '¡Gracias por jugar!',
    'And the winner is…': 'Y el ganador es…'
  },
  fr: {
    'Show the message': 'Afficher le message',
    'Send the question to students': 'Envoyer la question aux élèves',
    'Next question': 'Question suivante',
    'Start the first question': 'Lancer la première question',
    'Start the voting': 'Lancer le vote',
    'Reveal the results': 'Révéler les résultats',
    'Start revealing': 'Commencer la révélation',
    'Review before the class sees it': 'Vérifier avant que la classe le voie',
    'Show the standings': 'Afficher le classement',
    'Crown the winner': 'Couronner le gagnant',
    'Start ranking': 'Lancer le classement',
    'Start rating': 'Lancer la notation',
    'Start guessing': 'Lancer les estimations',
    'Start matching': 'Lancer les associations',
    'Start sorting': 'Lancer le tri',
    'Open the buzzers': 'Ouvrir les buzzers',
    'Start the pair work': 'Lancer le travail en binôme',
    'Start counting together': 'Commencer à compter ensemble',
    'Start the round': 'Lancer la manche',
    'Start the relay': 'Lancer le relais',
    'Split into teams': 'Former les équipes',
    'Open the bets': 'Ouvrir les paris',
    'Start the checklist': 'Lancer la liste de tâches',
    'Run the elimination': "Lancer l'élimination",
    'Let the AI work': "Laisser l'IA travailler",
    'Start the first round': 'Lancer la première manche',
    'Finish up': 'Terminer',
    'Continue': 'Continuer',
    'End the ratings': 'Clore les notes',
    'Lock in the guesses': 'Verrouiller les estimations',
    'Reveal the answers': 'Révéler les réponses',
    'End work time': 'Fin du temps de travail',
    'Start!': 'Commencer !',
    'Waiting for students to join...': 'En attente des élèves...',
    "Who's in": 'Qui est là',
    'Players are answering...': 'Les joueurs répondent...',
    'Close Submissions': 'Clore les réponses',
    'AI is processing...': "L'IA travaille...",
    'Voting in progress...': 'Vote en cours...',
    'Close Voting': 'Clore le vote',
    'Round Results': 'Résultats de la manche',
    'End Session': 'Terminer la session',
    'Leaderboard': 'Classement',
    'Reveal Next': 'Révéler le suivant',
    'Teams': 'Équipes',
    'Confirm Teams': 'Confirmer les équipes',
    'Close Ranking': 'Clore le classement',
    'Reveal the Answers': 'Révéler les réponses',
    'Reveal the Answer': 'Révéler la réponse',
    'End Work Time': 'Fin du temps de travail',
    'Close Merging': 'Clore la mise en commun',
    'Move On': 'Passer à la suite',
    'Finish round': 'Terminer la manche',
    'Listen for the question!': 'Écoutez la question !',
    'Count together, one voice at a time': 'Comptez ensemble, une voix à la fois',
    '✓ Correct': '✓ Correct',
    '✗ Wrong': '✗ Faux',
    'Join In': 'Rejoindre',
    'Room code': 'Code de la salle',
    'Each letter you type fills a block.': 'Chaque lettre tapée remplit un bloc.',
    'Your name': 'Ton prénom',
    'First name': 'Prénom',
    'Leave blank to join as Anonymous.': 'Laisse vide pour rejoindre en anonyme.',
    'Join': 'Rejoindre',
    "You're in!": 'Tu es dans la salle !',
    'Answer the question:': 'Réponds à la question :',
    '↩ Undo': '↩ Annuler',
    '✕ Clear': '✕ Effacer',
    'Type your answer here...': 'Écris ta réponse ici...',
    'Submit': 'Envoyer',
    'Answer submitted!': 'Réponse envoyée !',
    "Reading everyone's answers...": 'Lecture des réponses de tous...',
    'The Result:': 'Le résultat :',
    'Vote!': 'Vote !',
    'Vote submitted!': 'Vote envoyé !',
    'Which is better?': 'Lequel est le meilleur ?',
    'Pick your favorite!': 'Choisis ton préféré !',
    'Elimination Results': "Résultats de l'élimination",
    'Submit Ranking': 'Envoyer le classement',
    'Submit Matches': 'Envoyer les associations',
    'Submit Sorting': 'Envoyer le tri',
    'Write your shared answer together...': 'Écrivez ensemble votre réponse commune...',
    'We agree, submit': "On est d'accord, envoyer",
    'Take the pen': 'Prendre le stylo',
    'Say the next number, when it feels right.': 'Dis le nombre suivant, quand tu le sens.',
    'Your guess': 'Ton estimation',
    'Submit Guess': "Envoyer l'estimation",
    'Bet amount:': 'Montant du pari :',
    'Place Wager': 'Parier',
    'Add your part...': 'Ajoute ta partie...',
    'Submitted! Waiting...': 'Envoyé ! En attente...',
    '✓ Got It!': '✓ Trouvé !',
    'Skip': 'Passer',
    'Submit Ratings': 'Envoyer les notes',
    'Pass this one': 'Passer celle-ci',
    'Thanks for playing!': "Merci d'avoir joué !",
    'And the winner is…': 'Et le gagnant est…'
  },
  de: {
    'Show the message': 'Nachricht anzeigen',
    'Send the question to students': 'Frage an die Schüler senden',
    'Next question': 'Nächste Frage',
    'Start the first question': 'Erste Frage starten',
    'Start the voting': 'Abstimmung starten',
    'Reveal the results': 'Ergebnisse zeigen',
    'Start revealing': 'Mit dem Aufdecken beginnen',
    'Review before the class sees it': 'Prüfen, bevor die Klasse es sieht',
    'Show the standings': 'Rangliste anzeigen',
    'Crown the winner': 'Gewinner küren',
    'Start ranking': 'Reihenfolge festlegen',
    'Start rating': 'Bewertung starten',
    'Start guessing': 'Schätzen starten',
    'Start matching': 'Zuordnen starten',
    'Start sorting': 'Sortieren starten',
    'Open the buzzers': 'Buzzer freigeben',
    'Start the pair work': 'Partnerarbeit starten',
    'Start counting together': 'Gemeinsam zählen',
    'Start the round': 'Runde starten',
    'Start the relay': 'Staffel starten',
    'Split into teams': 'In Teams aufteilen',
    'Open the bets': 'Wetten öffnen',
    'Start the checklist': 'Checkliste starten',
    'Run the elimination': 'Ausscheiden durchführen',
    'Let the AI work': 'Die KI arbeiten lassen',
    'Start the first round': 'Erste Runde starten',
    'Finish up': 'Abschließen',
    'Continue': 'Weiter',
    'End the ratings': 'Bewertung beenden',
    'Lock in the guesses': 'Schätzungen festhalten',
    'Reveal the answers': 'Antworten zeigen',
    'End work time': 'Arbeitszeit beenden',
    'Start!': 'Los!',
    'Waiting for students to join...': 'Warten auf die Schüler...',
    "Who's in": 'Wer ist da',
    'Players are answering...': 'Die Spieler antworten...',
    'Close Submissions': 'Antworten schließen',
    'AI is processing...': 'Die KI arbeitet...',
    'Voting in progress...': 'Abstimmung läuft...',
    'Close Voting': 'Abstimmung schließen',
    'Round Results': 'Rundenergebnis',
    'End Session': 'Sitzung beenden',
    'Leaderboard': 'Rangliste',
    'Reveal Next': 'Nächstes aufdecken',
    'Teams': 'Teams',
    'Confirm Teams': 'Teams bestätigen',
    'Close Ranking': 'Reihenfolge schließen',
    'Reveal the Answers': 'Antworten zeigen',
    'Reveal the Answer': 'Antwort zeigen',
    'End Work Time': 'Arbeitszeit beenden',
    'Close Merging': 'Zusammenführen beenden',
    'Move On': 'Weiter',
    'Finish round': 'Runde beenden',
    'Listen for the question!': 'Hört auf die Frage!',
    'Count together, one voice at a time': 'Zählt zusammen, eine Stimme nach der anderen',
    '✓ Correct': '✓ Richtig',
    '✗ Wrong': '✗ Falsch',
    'Join In': 'Mitmachen',
    'Room code': 'Raumcode',
    'Each letter you type fills a block.': 'Jeder Buchstabe füllt einen Block.',
    'Your name': 'Dein Name',
    'First name': 'Vorname',
    'Leave blank to join as Anonymous.': 'Leer lassen, um anonym mitzumachen.',
    'Join': 'Beitreten',
    "You're in!": 'Du bist drin!',
    'Answer the question:': 'Beantworte die Frage:',
    '↩ Undo': '↩ Rückgängig',
    '✕ Clear': '✕ Löschen',
    'Type your answer here...': 'Schreibe deine Antwort hier...',
    'Submit': 'Absenden',
    'Answer submitted!': 'Antwort gesendet!',
    "Reading everyone's answers...": 'Alle Antworten werden gelesen...',
    'The Result:': 'Das Ergebnis:',
    'Vote!': 'Abstimmen!',
    'Vote submitted!': 'Stimme abgegeben!',
    'Which is better?': 'Was ist besser?',
    'Pick your favorite!': 'Wähle deinen Favoriten!',
    'Elimination Results': 'Ausscheidungsergebnis',
    'Submit Ranking': 'Reihenfolge absenden',
    'Submit Matches': 'Zuordnung absenden',
    'Submit Sorting': 'Sortierung absenden',
    'Write your shared answer together...': 'Schreibt eure gemeinsame Antwort...',
    'We agree, submit': 'Wir sind uns einig, absenden',
    'Take the pen': 'Den Stift nehmen',
    'Say the next number, when it feels right.': 'Sag die nächste Zahl, wenn es sich richtig anfühlt.',
    'Your guess': 'Deine Schätzung',
    'Submit Guess': 'Schätzung absenden',
    'Bet amount:': 'Einsatz:',
    'Place Wager': 'Wette setzen',
    'Add your part...': 'Füge deinen Teil hinzu...',
    'Submitted! Waiting...': 'Gesendet! Warten...',
    '✓ Got It!': '✓ Erraten!',
    'Skip': 'Überspringen',
    'Submit Ratings': 'Bewertungen absenden',
    'Pass this one': 'Diese überspringen',
    'Thanks for playing!': 'Danke fürs Mitspielen!',
    'And the winner is…': 'Und der Gewinner ist…'
  },
  pt: {
    'Show the message': 'Mostrar a mensagem',
    'Send the question to students': 'Enviar a pergunta aos alunos',
    'Next question': 'Próxima pergunta',
    'Start the first question': 'Começar a primeira pergunta',
    'Start the voting': 'Começar a votação',
    'Reveal the results': 'Revelar os resultados',
    'Start revealing': 'Começar a revelar',
    'Review before the class sees it': 'Rever antes de a turma ver',
    'Show the standings': 'Mostrar a classificação',
    'Crown the winner': 'Coroar o vencedor',
    'Start ranking': 'Começar a ordenar',
    'Start rating': 'Começar a avaliar',
    'Start guessing': 'Começar a adivinhar',
    'Start matching': 'Começar a combinar',
    'Start sorting': 'Começar a classificar',
    'Open the buzzers': 'Abrir os buzzers',
    'Start the pair work': 'Começar o trabalho em pares',
    'Start counting together': 'Começar a contar juntos',
    'Start the round': 'Começar a rodada',
    'Start the relay': 'Começar o revezamento',
    'Split into teams': 'Dividir em equipes',
    'Open the bets': 'Abrir as apostas',
    'Start the checklist': 'Começar a lista de tarefas',
    'Run the elimination': 'Fazer a eliminação',
    'Let the AI work': 'Deixar a IA trabalhar',
    'Start the first round': 'Começar a primeira rodada',
    'Finish up': 'Terminar',
    'Continue': 'Continuar',
    'End the ratings': 'Encerrar as avaliações',
    'Lock in the guesses': 'Travar os palpites',
    'Reveal the answers': 'Revelar as respostas',
    'End work time': 'Encerrar o tempo de trabalho',
    'Start!': 'Começar!',
    'Waiting for students to join...': 'Esperando os alunos entrarem...',
    "Who's in": 'Quem está',
    'Players are answering...': 'Os jogadores estão respondendo...',
    'Close Submissions': 'Encerrar respostas',
    'AI is processing...': 'A IA está trabalhando...',
    'Voting in progress...': 'Votação em andamento...',
    'Close Voting': 'Encerrar votação',
    'Round Results': 'Resultados da rodada',
    'End Session': 'Encerrar a sessão',
    'Leaderboard': 'Classificação',
    'Reveal Next': 'Revelar o próximo',
    'Teams': 'Equipes',
    'Confirm Teams': 'Confirmar equipes',
    'Close Ranking': 'Encerrar a ordenação',
    'Reveal the Answers': 'Revelar as respostas',
    'Reveal the Answer': 'Revelar a resposta',
    'End Work Time': 'Encerrar o tempo de trabalho',
    'Close Merging': 'Encerrar a junção',
    'Move On': 'Seguir',
    'Finish round': 'Terminar a rodada',
    'Listen for the question!': 'Ouça a pergunta!',
    'Count together, one voice at a time': 'Contem juntos, uma voz de cada vez',
    '✓ Correct': '✓ Correto',
    '✗ Wrong': '✗ Errado',
    'Join In': 'Entrar',
    'Room code': 'Código da sala',
    'Each letter you type fills a block.': 'Cada letra que você digita preenche um bloco.',
    'Your name': 'Seu nome',
    'First name': 'Primeiro nome',
    'Leave blank to join as Anonymous.': 'Deixe em branco para entrar como Anônimo.',
    'Join': 'Entrar',
    "You're in!": 'Você entrou!',
    'Answer the question:': 'Responda à pergunta:',
    '↩ Undo': '↩ Desfazer',
    '✕ Clear': '✕ Limpar',
    'Type your answer here...': 'Digite sua resposta aqui...',
    'Submit': 'Enviar',
    'Answer submitted!': 'Resposta enviada!',
    "Reading everyone's answers...": 'Lendo as respostas de todos...',
    'The Result:': 'O resultado:',
    'Vote!': 'Vote!',
    'Vote submitted!': 'Voto enviado!',
    'Which is better?': 'Qual é melhor?',
    'Pick your favorite!': 'Escolha seu favorito!',
    'Elimination Results': 'Resultados da eliminação',
    'Submit Ranking': 'Enviar a ordem',
    'Submit Matches': 'Enviar as combinações',
    'Submit Sorting': 'Enviar a classificação',
    'Write your shared answer together...': 'Escrevam juntos a resposta compartilhada...',
    'We agree, submit': 'Concordamos, enviar',
    'Take the pen': 'Pegar a caneta',
    'Say the next number, when it feels right.': 'Diga o próximo número quando sentir que é a hora.',
    'Your guess': 'Seu palpite',
    'Submit Guess': 'Enviar palpite',
    'Bet amount:': 'Valor da aposta:',
    'Place Wager': 'Apostar',
    'Add your part...': 'Adicione sua parte...',
    'Submitted! Waiting...': 'Enviado! Aguardando...',
    '✓ Got It!': '✓ Acertou!',
    'Skip': 'Pular',
    'Submit Ratings': 'Enviar avaliações',
    'Pass this one': 'Pular esta',
    'Thanks for playing!': 'Obrigado por jogar!',
    'And the winner is…': 'E o vencedor é…'
  },
  it: {
    'Show the message': 'Mostra il messaggio',
    'Send the question to students': 'Invia la domanda agli studenti',
    'Next question': 'Prossima domanda',
    'Start the first question': 'Inizia la prima domanda',
    'Start the voting': 'Inizia la votazione',
    'Reveal the results': 'Rivela i risultati',
    'Start revealing': 'Inizia a rivelare',
    'Review before the class sees it': 'Controlla prima che la classe lo veda',
    'Show the standings': 'Mostra la classifica',
    'Crown the winner': 'Incorona il vincitore',
    'Start ranking': 'Inizia a ordinare',
    'Start rating': 'Inizia a valutare',
    'Start guessing': 'Inizia a indovinare',
    'Start matching': 'Inizia ad abbinare',
    'Start sorting': 'Inizia a classificare',
    'Open the buzzers': 'Apri i pulsanti',
    'Start the pair work': 'Inizia il lavoro in coppia',
    'Start counting together': 'Inizia a contare insieme',
    'Start the round': 'Inizia il turno',
    'Start the relay': 'Inizia la staffetta',
    'Split into teams': 'Dividi in squadre',
    'Open the bets': 'Apri le scommesse',
    'Start the checklist': 'Inizia la lista di controllo',
    'Run the elimination': "Esegui l'eliminazione",
    'Let the AI work': "Lascia lavorare l'IA",
    'Start the first round': 'Inizia il primo turno',
    'Finish up': 'Concludi',
    'Continue': 'Continua',
    'End the ratings': 'Chiudi le valutazioni',
    'Lock in the guesses': 'Blocca le risposte',
    'Reveal the answers': 'Rivela le risposte',
    'End work time': 'Fine del tempo di lavoro',
    'Start!': 'Via!',
    'Waiting for students to join...': 'In attesa degli studenti...',
    "Who's in": "Chi c'è",
    'Players are answering...': 'I giocatori stanno rispondendo...',
    'Close Submissions': 'Chiudi le risposte',
    'AI is processing...': "L'IA sta lavorando...",
    'Voting in progress...': 'Votazione in corso...',
    'Close Voting': 'Chiudi la votazione',
    'Round Results': 'Risultati del turno',
    'End Session': 'Termina la sessione',
    'Leaderboard': 'Classifica',
    'Reveal Next': 'Rivela il prossimo',
    'Teams': 'Squadre',
    'Confirm Teams': 'Conferma le squadre',
    'Close Ranking': "Chiudi l'ordinamento",
    'Reveal the Answers': 'Rivela le risposte',
    'Reveal the Answer': 'Rivela la risposta',
    'End Work Time': 'Fine del tempo di lavoro',
    'Close Merging': 'Chiudi la condivisione',
    'Move On': 'Avanti',
    'Finish round': 'Termina il turno',
    'Listen for the question!': 'Ascolta la domanda!',
    'Count together, one voice at a time': 'Contate insieme, una voce alla volta',
    '✓ Correct': '✓ Corretto',
    '✗ Wrong': '✗ Sbagliato',
    'Join In': 'Partecipa',
    'Room code': 'Codice della stanza',
    'Each letter you type fills a block.': 'Ogni lettera che scrivi riempie un blocco.',
    'Your name': 'Il tuo nome',
    'First name': 'Nome',
    'Leave blank to join as Anonymous.': 'Lascia vuoto per entrare come Anonimo.',
    'Join': 'Entra',
    "You're in!": 'Sei dentro!',
    'Answer the question:': 'Rispondi alla domanda:',
    '↩ Undo': '↩ Annulla',
    '✕ Clear': '✕ Cancella',
    'Type your answer here...': 'Scrivi qui la tua risposta...',
    'Submit': 'Invia',
    'Answer submitted!': 'Risposta inviata!',
    "Reading everyone's answers...": 'Lettura delle risposte di tutti...',
    'The Result:': 'Il risultato:',
    'Vote!': 'Vota!',
    'Vote submitted!': 'Voto inviato!',
    'Which is better?': 'Quale è meglio?',
    'Pick your favorite!': 'Scegli il tuo preferito!',
    'Elimination Results': "Risultati dell'eliminazione",
    'Submit Ranking': "Invia l'ordine",
    'Submit Matches': 'Invia gli abbinamenti',
    'Submit Sorting': 'Invia la classificazione',
    'Write your shared answer together...': 'Scrivete insieme la vostra risposta condivisa...',
    'We agree, submit': "Siamo d'accordo, invia",
    'Take the pen': 'Prendi la penna',
    'Say the next number, when it feels right.': 'Di il prossimo numero, quando te la senti.',
    'Your guess': 'La tua stima',
    'Submit Guess': 'Invia la stima',
    'Bet amount:': 'Importo della scommessa:',
    'Place Wager': 'Scommetti',
    'Add your part...': 'Aggiungi la tua parte...',
    'Submitted! Waiting...': 'Inviato! In attesa...',
    '✓ Got It!': '✓ Indovinato!',
    'Skip': 'Salta',
    'Submit Ratings': 'Invia le valutazioni',
    'Pass this one': 'Salta questa',
    'Thanks for playing!': 'Grazie per aver giocato!',
    'And the winner is…': 'E il vincitore è…'
  }
};
