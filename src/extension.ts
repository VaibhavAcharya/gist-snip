import * as vscode from 'vscode';
import { Credentials } from './credentials';

export async function activate(context: vscode.ExtensionContext) {
	const credentials = new Credentials();
	await credentials.initialize(context);

	const octokit = await credentials.getOctokit();

	const disposable = vscode.commands.registerCommand('extension.authenticateWithGithub', async () => {
		const userInfo = await octokit.users.getAuthenticated();

		vscode.window.showInformationMessage(`Logged into GitHub as ${userInfo.data.login}`);
	});

	const items: vscode.CompletionItem[] = [];
	const supportedLanguages = new Set<string>(["*"]);

	const [{data: gistsOfOwn}, {data: gistsStared}] = await Promise.all([
		octokit.gists.list(),
		octokit.gists.listStarred()
	]);
	const gists = [...gistsOfOwn, ...gistsStared];
	
	for (let i = 0; i < (gists.length); i++) {
		const { data: gist } = await octokit.gists.get({
			gist_id: gists[i].id,
		});

		if (!gist || !(gist.files) || !(gist?.owner)) {
			continue;
		}

		const files = Object.values(gist.files);
		
		for (let j = 0; j < (files.length); j++) {
			const file = files[j];

			if (!file || !(file.filename)) {
				continue;
			}

			const completionItem = new vscode.CompletionItem({
				label: file.filename,
				detail: files[0]?.filename === file.filename ?  undefined : ` part of ${files[0]?.filename}`,
				description: `${gist.owner.login}`,
			});
			completionItem.insertText = new vscode.SnippetString(file.content);
			completionItem.kind = vscode.CompletionItemKind.File;

			const documentationMarkdown = new vscode.MarkdownString();
			documentationMarkdown.appendMarkdown(`**[${file.filename}](${gist.html_url})**`);
			documentationMarkdown.appendText("\n");
			if (gist.description) {
				documentationMarkdown.appendMarkdown(`${gist.description}`);
				documentationMarkdown.appendText("\n");
			}
			documentationMarkdown.appendMarkdown(`\`By\` **[${gist.owner.login}](${gist.owner.html_url})**`);
			documentationMarkdown.appendText("\n");
			documentationMarkdown.appendMarkdown(`\`Created on\` *${gist.created_at}*`);
			documentationMarkdown.appendText("\n\n");
			documentationMarkdown.appendCodeblock(`${file.content}`, file.language);

			completionItem.documentation = documentationMarkdown;
			
			items.push(completionItem);
			if (file.language) {
				supportedLanguages.add(file.language.toLowerCase()); 
			}
		}
	}
	
	const completionProvider = vscode.languages.registerCompletionItemProvider(Array.from(supportedLanguages),
		{
			async provideCompletionItems() {
				return items;
			}
		},

	);

	context.subscriptions.push(disposable);
	context.subscriptions.push(completionProvider);
}
