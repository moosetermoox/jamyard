// --- Game Templates ---
// Shared between designer list page and editor
// Each template is a function returning a valid game config

window.GAME_TEMPLATES = {
  blank: {
    name: 'Blank',
    icon: '\uD83D\uDCC4',
    description: 'Start from scratch with just a lobby and end screen',
    config: function () {
      return {
        name: 'New Game',
        description: '',
        minPlayers: 2,
        maxPlayers: 36,
        phases: {
          lobby: { type: 'lobby', next: 'end' },
          end: { type: 'end', message: 'Thanks for playing!' }
        }
      };
    }
  },

  'simple-poll': {
    name: 'Simple Poll',
    icon: '\uD83D\uDCCA',
    description: 'Ask a multiple-choice question, show results as a bar chart',
    config: function () {
      return {
        name: 'Quick Poll',
        description: 'Ask the class a question and see the results as a bar chart',
        minPlayers: 2,
        maxPlayers: 36,
        phases: {
          lobby: { type: 'lobby', next: 'ask' },
          ask: {
            type: 'collect-choice',
            prompt: 'What do you think?',
            choices: ['Option A', 'Option B', 'Option C', 'Option D'],
            timer: 60,
            next: 'results'
          },
          results: {
            type: 'reveal',
            template: 'Here\u2019s how the class voted:\n\n{{ask.barChart}}',
            next: 'end'
          },
          end: { type: 'end', message: 'Thanks for sharing!' }
        }
      };
    }
  },

  'creative-writing': {
    name: 'Creative Writing',
    icon: '\u270D\uFE0F',
    description: 'Collect ideas, AI creates something, teacher reviews before showing',
    config: function () {
      return {
        name: 'Story Time',
        description: 'Everyone contributes ideas, AI weaves them into a story',
        minPlayers: 2,
        maxPlayers: 36,
        phases: {
          lobby: { type: 'lobby', next: 'collect' },
          collect: {
            type: 'collect',
            prompt: 'Give me one interesting idea, character, or setting for a story!',
            timer: 60,
            next: 'generate'
          },
          generate: {
            type: 'ai-process',
            task: 'generate',
            instruction: 'Write a short, fun story (3-4 paragraphs) that incorporates as many of the student ideas as possible. Keep it age-appropriate and entertaining.',
            input: 'collect.responses',
            format: 'text',
            next: 'review'
          },
          review: {
            type: 'preview',
            content: 'generate.result',
            showResponses: true,
            approveNext: 'show',
            rejectNext: 'generate'
          },
          show: {
            type: 'reveal',
            template: '{{generate.result}}',
            next: 'end'
          },
          end: { type: 'end', message: 'Great story, everyone!' }
        }
      };
    }
  },

  'elimination-game': {
    name: 'Elimination Game',
    icon: '\u2694\uFE0F',
    description: 'Competition with rounds — vote and eliminate until a winner remains',
    config: function () {
      return {
        name: 'Last One Standing',
        description: 'Answer questions, vote on favorites, and try to survive!',
        minPlayers: 4,
        maxPlayers: 36,
        phases: {
          lobby: { type: 'lobby', next: 'round-intro' },
          'round-intro': {
            type: 'announce',
            message: 'Round {{_loop.eliminate.iteration}} of {{_loop.eliminate.total}} — Submit your best answer!',
            timer: 5,
            next: 'answer'
          },
          answer: {
            type: 'collect',
            prompt: 'Give your most creative answer!',
            from: 'remaining',
            timer: 45,
            next: 'voting'
          },
          voting: {
            type: 'vote',
            mode: 'pick-one',
            candidates: 'answer.responses',
            question: 'Which answer is the best?',
            timer: 30,
            next: 'eliminate'
          },
          eliminate: {
            type: 'eliminate',
            method: 'bottom-percent',
            percent: 50,
            input: 'voting.scores',
            next: 'winner',
            loopBack: 'round-intro',
            loopCount: 3
          },
          winner: {
            type: 'winner',
            from: 'voting.scores',
            next: 'end'
          },
          end: { type: 'end', message: 'Great game, everyone!' }
        }
      };
    }
  },

  'quiz-show': {
    name: 'Quiz Show',
    icon: '\u2753',
    description: 'Multiple choice quiz with AI-generated summary',
    config: function () {
      return {
        name: 'Quick Quiz',
        description: 'Answer a multiple choice question and see how the class did',
        minPlayers: 2,
        maxPlayers: 36,
        phases: {
          lobby: { type: 'lobby', next: 'question' },
          question: {
            type: 'collect-choice',
            prompt: 'What is the capital of France?',
            choices: ['London', 'Paris', 'Berlin', 'Madrid'],
            timer: 30,
            next: 'analyze'
          },
          analyze: {
            type: 'ai-process',
            task: 'summarize',
            instruction: 'Summarize the class responses. Note the correct answer is Paris. Tell us how many got it right and wrong, and add an encouraging comment.',
            input: 'question.responses',
            format: 'text',
            next: 'results'
          },
          results: {
            type: 'announce',
            message: '{{analyze.result}}',
            next: 'end'
          },
          end: { type: 'end', message: 'Thanks for playing!' }
        }
      };
    }
  }
};
