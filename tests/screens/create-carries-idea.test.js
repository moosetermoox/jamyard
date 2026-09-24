import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// A reviewer's first fix (2026-09-23): "a five-minute anonymous history
// poll" with four choices came back as "Good news: this already exists"
// (the Live Poll built-in), and Make it yours opened the default question
// about today's lesson with names Shown. Three things guard the repair:
// the route refits a recipe-born pick to its recipe (engine/match-refit.js)
// and reads "anonymous" itself (engine/idea-settings.js), the settings list
// shows the names row, and the "already exists" card says the idea is not
// carried over before the teacher walks through it.

const designer = readFileSync('screens/designer/designer.js', 'utf8');
const server = readFileSync('server.js', 'utf8');

describe('the Create page carries the idea into the match', () => {
  it('the route refits a recipe-born built-in to its recipe and reads the idea\'s settings', () => {
    expect(server).toContain("import { applyIdeaSettings } from './engine/idea-settings.js';");
    expect(server).toContain("import { refitRecipeIdFor } from './engine/match-refit.js';");
    expect(server).toContain('const refitId = refitRecipeIdFor(match.game, loadedGames);');
    expect(server).toContain('aiService.matchRecipe(description, [summarizeRecipe(refitRecipe)], { forced: true })');
    expect(server).toContain('const settings = applyIdeaSettings(config, description);');
    // The matcher is told which built-ins are recipe-born
    expect(server).toContain("recipe: (config.recipe && typeof config.recipe.id === 'string') ? config.recipe.id : null");
  });

  it('the settings list shows the names row when the idea named it', () => {
    expect(designer).toContain("if (data.settings && typeof data.settings.anonymous === 'boolean') {");
    expect(designer).toContain("settingLabel.textContent = 'Student names';");
    expect(designer).toContain("settingValue.textContent = data.settings.anonymous ? 'Hidden' : 'Shown';");
  });

  it('the "already exists" card says the idea is not copied into the finished activity', () => {
    expect(designer).toContain('What you typed is not copied into it. Make it yours opens it with every line editable');
    expect(designer).toContain("', or pick one of the recipes below to build it from your idea.'");
  });
});
