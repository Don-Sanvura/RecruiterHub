import { clearHubLinks, deleteHubNode, drawHubLinks, openNodeDialog, renderHub, saveDialogNode, toggleAuditView } from './hub.js';
import { applyPreset, copyPitch, copyShareLink, generateCard, renderRecruiter, saveCardToHub, setMode, shareCard, updateMissionStatus } from './recruiter.js';
import { getSharedFileUrl } from './files.js';
import { downloadExcel } from './export.js';
import { firebaseConfigured } from './firebase-client.js';
import { mountNeuralNetwork } from './neural-network.js';
import { getNotes, loadNotes, loadSkills, subscribeToRecordChanges, subscribeToSkillChanges } from './storage.js';

const app = document.querySelector('#app');
let disposeNeuralNetwork;
let unsubscribeRecords;
let unsubscribeSkills;
let routeVersion = 0;

const routeTable = {
	'/': { title: '' },
	'/recruiter': { title: 'Recruiter Hub' },
	'/info': { title: 'Info Hub' }
};

function parseRoute() {
	const fragment = location.hash.slice(1);
	const pagePath = document.body.dataset.page === 'info'
		? '/info'
		: document.body.dataset.page === 'recruiter'
			? '/recruiter'
			: location.pathname;
	const source = fragment || pagePath;
	const separator = source.indexOf('?');
	let rawPath = separator < 0 ? source : source.slice(0, separator);
	if (rawPath === '/hub') rawPath = '/info';
	return {
		path: rawPath.startsWith('/') ? rawPath : `/${rawPath}`
	};
}

function navigation(title = '') {
	const otherPage = title === 'Info Hub'
		? '<a class="button button-quiet" href="/">Home</a><a class="button button-quiet" href="/recruiterhub.html">Recruiter Hub</a>'
		: '';
	return `<header class="topbar"><div class="topbar-right">${title ? `<p class="topbar-title">${title}</p>` : ''}${otherPage}</div></header>`;
}

function firebaseSetup(title) {
	return `${navigation(title)}<section class="surface auth-panel"><p class="eyebrow">Firebase setup</p><h1>Connect shared data</h1><p class="auth-copy">Add your Firebase web app values to <code>.env.local</code> using the names in <code>.env.example</code>. Enable Firestore Database and Firebase Storage, then deploy <code>firestore.rules</code> and <code>storage.rules</code>. Rebuild and redeploy to make data available across devices in real time.</p></section>`;
}

function landing() {
	return `<section class="landing"><div class="landing-intro"><p class="eyebrow">Your next conversation, connected</p><h1>Research meets <span class="gradient-text">first impressions.</span></h1><p class="landing-copy">A clear space to map the companies you care about, plus a quick pitch studio for the moments that matter.</p></div><div class="portal-grid"><a class="surface portal" href="/infohub.html"><span class="portal-icon" aria-hidden="true">⌘</span><span class="portal-arrow" aria-hidden="true">↗</span><h2>Information Hub</h2><p>Build a connected map of company research, career notes, and conversations.</p></a><a class="surface portal" href="/recruiterhub.html"><span class="portal-icon" aria-hidden="true">AI</span><span class="portal-arrow" aria-hidden="true">↗</span><h2>Recruiter Hub</h2><p>Turn three team keywords into a memorable, shareable pitch card.</p></a></div></section>`;
}

function notFound() {
	return `${navigation()}<section class="surface auth-panel"><p class="eyebrow">Route not found</p><h1>This route does not exist.</h1><a class="button button-primary" href="#/">Return to start</a></section>`;
}

function disposeCurrentView() {
	disposeNeuralNetwork?.();
	disposeNeuralNetwork = undefined;
	unsubscribeRecords?.();
	unsubscribeRecords = undefined;
	unsubscribeSkills?.();
	unsubscribeSkills = undefined;
	clearHubLinks();
}

function mountNetwork() {
	const canvas = document.querySelector('#neural-canvas');
	return canvas ? mountNeuralNetwork(canvas) : undefined;
}

function renderHubView() {
	app.innerHTML = navigation('Info Hub') + renderHub();
	drawHubLinks();
	disposeNeuralNetwork = mountNetwork();
}

async function refreshHubView() {
	if (parseRoute().path !== '/info') return;
	const auditWasOpen = Boolean(document.querySelector('#audit-view') && !document.querySelector('#audit-view').hidden);
	disposeNeuralNetwork?.();
	disposeNeuralNetwork = undefined;
	clearHubLinks();
	renderHubView();
	if (auditWasOpen) toggleAuditView();
}

async function renderRoute() {
	const version = ++routeVersion;
	const { path } = parseRoute();
	const route = routeTable[path];
	window.scrollTo(0, 0);
	disposeCurrentView();
	document.body.classList.toggle('recruiter-active', path === '/recruiter');
	document.body.classList.toggle('hub-active', path === '/info');

	if (!route) {
		app.innerHTML = notFound();
		return;
	}
	if (path === '/') {
		app.innerHTML = navigation() + landing();
		return;
	}
	if (!firebaseConfigured) {
		app.innerHTML = firebaseSetup(route.title);
		return;
	}

	if (path === '/info') {
		try {
			await loadNotes();
		} catch (error) {
			app.innerHTML = `${navigation(route.title)}<section class="surface auth-panel"><p class="eyebrow">Cloud data</p><h1>Info Hub could not load.</h1><p class="auth-copy"></p></section>`;
			app.querySelector('.auth-copy').textContent = error.message || 'Could not load shared Firebase data. Check your Firebase configuration and Firestore rules.';
			return;
		}
		if (version !== routeVersion) return;
		renderHubView();
		unsubscribeRecords = subscribeToRecordChanges(
			() => { void refreshHubView(); },
			error => {
				const alert = document.createElement('p');
				alert.className = 'hub-notice';
				alert.setAttribute('role', 'alert');
				alert.textContent = `Live data updates stopped: ${error.message}`;
				app.prepend(alert);
			}
		);
		return;
	}

	app.innerHTML = navigation(route.title) + renderRecruiter();
	updateMissionStatus();
	disposeNeuralNetwork = mountNetwork();
	try {
		const skills = await loadSkills();
		if (version !== routeVersion) return;
		const skillsInput = document.querySelector('#skills');
		if (skillsInput) skillsInput.value = skills;
		unsubscribeSkills = subscribeToSkillChanges(value => {
			const input = document.querySelector('#skills');
			if (input && document.activeElement !== input) input.value = value;
		});
	} catch (error) {
		const status = document.querySelector('#mission-status-text');
		if (status) status.textContent = `Could not load shared skills: ${error.message}`;
	}
}

app.addEventListener('click', async event => {
	const button = event.target.closest('[data-action]');
	if (!button) return;
	const { action } = button.dataset;
	if (action === 'add-node') openNodeDialog();
	if (action === 'edit-node') openNodeDialog(button.dataset.id);
	if (action === 'delete-node' && await deleteHubNode(button.dataset.id)) await renderRoute();
	if (action === 'view-audit') toggleAuditView();
	if (action === 'view-audit-file') {
		const feedback = document.querySelector('#audit-feedback');
		const downloadTab = window.open('about:blank', '_blank');
		if (!downloadTab) {
			if (feedback) feedback.textContent = 'Allow pop-ups to open this shared attachment.';
			return;
		}
		downloadTab.opener = null;
		try {
			const fileUrl = await getSharedFileUrl(button.dataset.path);
			downloadTab.location.replace(fileUrl);
		} catch {
			downloadTab.close();
			if (feedback) feedback.textContent = 'The attachment could not be opened from this browser. It may have been removed.';
		}
	}
	if (action === 'export-excel') {
		const feedback = document.querySelector('#export-feedback');
		try {
			await downloadExcel(getNotes());
			if (feedback) feedback.textContent = 'Excel workbook downloaded.';
		} catch (error) {
			if (feedback) feedback.textContent = error.message || 'Could not export the Info Hub workbook.';
		}
	}
	if (action === 'apply-preset') applyPreset(button.dataset.preset);
	if (action === 'set-mode') setMode(button.dataset.mode);
	if (action === 'generate-card') await generateCard();
	if (action === 'copy-pitch') await copyPitch();
	if (action === 'copy-share-link') await copyShareLink();
	if (action === 'share-card') await shareCard();
	if (action === 'save-card') await saveCardToHub();
});

app.addEventListener('input', event => {
	if (/^k[1-3]$/.test(event.target.id)) {
		document.querySelectorAll('.preset-button').forEach(button => button.setAttribute('aria-pressed', 'false'));
		updateMissionStatus();
	}
});

const nodeDialog = document.querySelector('#node-dialog');
if (nodeDialog) {
	nodeDialog.addEventListener('click', event => {
		if (event.target.closest('[data-action="dismiss-node-dialog"]')) nodeDialog.close();
	});
	document.querySelector('#node-form').addEventListener('submit', async event => {
		event.preventDefault();
		if (await saveDialogNode()) await renderRoute();
	});
}

window.addEventListener('hashchange', () => { void renderRoute(); });
window.addEventListener('popstate', () => { void renderRoute(); });
window.addEventListener('resize', drawHubLinks);
void renderRoute();