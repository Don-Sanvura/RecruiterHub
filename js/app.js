import { clearHubLinks, deleteHubNode, drawHubLinks, openNodeDialog, renderHub, saveDialogNode, toggleAuditView } from './hub.js';
import { applyPreset, copyPitch, copyShareLink, generateCard, renderRecruiter, saveCardToHub, setMode, shareCard, updateMissionStatus } from './recruiter.js';
import { ensureAnonymousSession, getCurrentUser, hasRole, signIn, signOut } from './auth.js';
import { getTemporaryFileUrl } from './files.js';
import { mountNeuralNetwork } from './neural-network.js';
import { isLocalDemo, isSupabaseConfigured } from './supabase-client.js';
import { clearNotes, loadNotes, subscribeToRecordChanges } from './storage.js';

const app = document.querySelector('#app');
let disposeNeuralNetwork;
let unsubscribeRecords;
let routeVersion = 0;

const routeTable = {
	'/': { title: '', role: null },
	'/recruiter': { title: 'Recruiter Hub', role: null, anonymous: true },
	'/hub': { title: 'Info Hub', role: 'info' }
};

function parseRoute() {
	const fragment = location.hash.slice(1) || '/';
	const separator = fragment.indexOf('?');
	const rawPath = separator < 0 ? fragment : fragment.slice(0, separator);
	return {
		path: rawPath.startsWith('/') ? rawPath : `/${rawPath}`,
		params: new URLSearchParams(separator < 0 ? '' : fragment.slice(separator + 1))
	};
}

function navigation(title = '', role = null) {
	const action = title === 'Info Hub'
		? '<a class="button button-quiet" href="#/recruiter">Open Recruiter Hub</a>'
		: !title
			? '<a class="button button-quiet" href="#/hub">Explore the hub</a>'
			: '';
	const logout = role && !isLocalDemo
		? '<button class="button button-quiet" data-action="sign-out">Sign out</button>'
		: '';
	return `<header class="topbar"><div class="topbar-right">${title ? `<p class="topbar-title">${title}</p>` : ''}${action}${logout}</div></header>`;
}

function landing() {
	return `<section class="landing"><div class="landing-intro"><p class="eyebrow">Your next conversation, connected</p><h1>Research meets <span class="gradient-text">first impressions.</span></h1><p class="landing-copy">A clear space to map the companies you care about, plus a quick pitch studio for the moments that matter.</p></div><div class="portal-grid"><a class="surface portal" href="#/hub"><span class="portal-icon" aria-hidden="true">⌘</span><span class="portal-arrow" aria-hidden="true">↗</span><h2>Information Hub</h2><p>Build a connected map of company research, career notes, and conversations.</p></a><a class="surface portal" href="#/recruiter"><span class="portal-icon" aria-hidden="true">AI</span><span class="portal-arrow" aria-hidden="true">↗</span><h2>Recruiter Hub</h2><p>Turn three team keywords into a memorable, shareable pitch card.</p></a></div>${isLocalDemo ? '<p class="demo-banner">Local preview only. Configure Supabase before deployment to enable sign-in and durable storage.</p>' : ''}</section>`;
}

function loginPage(role) {
	const title = role === 'info' ? 'Info Hub sign in' : 'Recruiter sign in';
	const signUpLink = role === 'recruiter' && isSupabaseConfigured ? '<p class="auth-switch">New recruiter? <a href="#/signup?role=recruiter">Create an account</a></p>' : '';
	return `${navigation()}<section class="surface auth-panel"><p class="eyebrow">Neural Hub access</p><h1>${title}</h1><p class="auth-copy">Use the account assigned to your role. Recruiter accounts can submit referrals but cannot access Info Hub records.</p><form id="login-form" data-role="${role}"><label for="login-email">Email</label><input id="login-email" name="email" type="email" autocomplete="username" required><label for="login-password">Password</label><input id="login-password" name="password" type="password" autocomplete="current-password" required><button class="button button-primary" type="submit">Sign in</button><p class="form-feedback" id="login-feedback" role="status" aria-live="polite"></p></form>${signUpLink}</section>`;
}

function accessDenied() {
	return `${navigation()}<section class="surface auth-panel"><p class="eyebrow">Access restricted</p><h1>This account cannot open this area.</h1><p class="auth-copy">Your account role does not have permission to view this route. Ask an Info Hub administrator if you need access.</p><button class="button button-quiet" data-action="sign-out">Sign out</button></section>`;
}

function setupRequired() {
	return `${navigation()}<section class="surface auth-panel"><p class="eyebrow">Deployment setup</p><h1>Connect your Supabase project</h1><p class="auth-copy">Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> to the deployment environment, then apply <code>supabase/schema.sql</code>. Enable anonymous sign-ins for recruiter submissions.</p></section>`;
}

function notFound() {
	return `${navigation()}<section class="surface auth-panel"><p class="eyebrow">Route not found</p><h1>This route does not exist.</h1><a class="button button-primary" href="#/">Return to start</a></section>`;
}

function disposeCurrentView() {
	disposeNeuralNetwork?.();
	disposeNeuralNetwork = undefined;
	unsubscribeRecords?.();
	unsubscribeRecords = undefined;
	clearHubLinks();
}

function mountNetwork() {
	const canvas = document.querySelector('#neural-canvas');
	return canvas ? mountNeuralNetwork(canvas) : undefined;
}

function renderHubView() {
	app.innerHTML = navigation('Info Hub', 'info') + renderHub();
	drawHubLinks();
	disposeNeuralNetwork = mountNetwork();
}

async function refreshHubView() {
	await loadNotes();
	if (parseRoute().path !== '/hub') return;
	const auditWasOpen = Boolean(document.querySelector('#audit-view') && !document.querySelector('#audit-view').hidden);
	disposeCurrentView();
	renderHubView();
	if (auditWasOpen) toggleAuditView();
}

async function renderRoute() {
	const version = ++routeVersion;
	const { path, params } = parseRoute();
	const route = routeTable[path];
	window.scrollTo(0, 0);
	disposeCurrentView();
	document.body.classList.toggle('recruiter-active', path === '/recruiter');
	document.body.classList.toggle('hub-active', path === '/hub');

	if (path === '/login') {
		if (!isSupabaseConfigured && !isLocalDemo) {
			app.innerHTML = setupRequired();
			return;
		}
		if (params.get('role') !== 'info') {
			location.hash = '#/recruiter';
			return;
		}
		app.innerHTML = loginPage('info');
		return;
	}
	if (!route) {
		app.innerHTML = notFound();
		return;
	}
	if (!route.role && !route.anonymous) {
		app.innerHTML = navigation() + landing();
		return;
	}

	let user = null;
	if (route.anonymous && !isLocalDemo) {
		if (!isSupabaseConfigured) {
			app.innerHTML = setupRequired();
			return;
		}
		try {
			user = await ensureAnonymousSession();
		} catch {
			app.innerHTML = `${navigation()}<section class="surface auth-panel"><p class="eyebrow">Recruiter access</p><h1>Could not start a private session.</h1><p class="auth-copy">Enable anonymous sign-ins for the Supabase project, then reload this page.</p></section>`;
			return;
		}
		if (version !== routeVersion) return;
	} else if (!isSupabaseConfigured) {
		if (!isLocalDemo) {
			app.innerHTML = setupRequired();
			return;
		}
	} else {
		try {
			user = await getCurrentUser();
		} catch {
			app.innerHTML = loginPage(route.role);
			return;
		}
		if (version !== routeVersion) return;
		if (!user) {
			location.hash = `#/login?role=${route.role}`;
			return;
		}
		if (!hasRole(user, route.role)) {
			app.innerHTML = accessDenied();
			return;
		}
	}

	document.body.classList.toggle('demo-mode', isLocalDemo);
	if (path === '/hub') {
		try {
			await loadNotes();
		} catch {
			app.innerHTML = `${navigation(route.title, route.role)}<section class="surface auth-panel"><p class="eyebrow">Data connection</p><h1>Info Hub could not load.</h1><p class="auth-copy">Check the database connection, then reload this page.</p></section>`;
			return;
		}
		if (version !== routeVersion) return;
		renderHubView();
		unsubscribeRecords = subscribeToRecordChanges(() => { void refreshHubView(); });
		return;
	}

	app.innerHTML = navigation(route.title, route.role) + renderRecruiter();
	updateMissionStatus();
	disposeNeuralNetwork = mountNetwork();
}

app.addEventListener('click', async event => {
	const button = event.target.closest('[data-action]');
	if (!button) return;
	const { action } = button.dataset;
	if (action === 'sign-out') {
		try { await signOut(); } finally { clearNotes(); location.hash = '#/'; }
	}
	if (action === 'add-node') openNodeDialog();
	if (action === 'edit-node') openNodeDialog(button.dataset.id);
	if (action === 'delete-node' && await deleteHubNode(button.dataset.id)) await renderRoute();
	if (action === 'view-audit') toggleAuditView();
	if (action === 'view-audit-file') {
		const feedback = document.querySelector('#audit-feedback');
		const downloadTab = window.open('about:blank', '_blank');
		if (!downloadTab) {
			if (feedback) feedback.textContent = 'Allow pop-ups to open this private attachment.';
			return;
		}
		downloadTab.opener = null;
		try {
			const signedUrl = await getTemporaryFileUrl(button.dataset.path);
			downloadTab.location.replace(signedUrl);
		} catch {
			downloadTab.close();
			if (feedback) feedback.textContent = 'The private attachment could not be opened. Check your access and try again.';
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

app.addEventListener('submit', async event => {
	if (event.target.id !== 'login-form') return;
	event.preventDefault();
	const form = event.target;
	const feedback = form.querySelector('#login-feedback');
	feedback.textContent = '';
	try {
		const user = await signIn(form.elements.email.value.trim(), form.elements.password.value);
		const role = form.dataset.role;
		if (!hasRole(user, role)) {
			await signOut();
			feedback.textContent = 'This account is not assigned to this area.';
			return;
		}
		location.hash = role === 'info' ? '#/hub' : '#/recruiter';
	} catch (error) {
		feedback.textContent = error.message || 'Sign-in failed. Check your credentials and try again.';
	}
});

const nodeDialog = document.querySelector('#node-dialog');
nodeDialog.addEventListener('click', event => {
	if (event.target.closest('[data-action="dismiss-node-dialog"]')) nodeDialog.close();
});
document.querySelector('#node-form').addEventListener('submit', async event => {
	event.preventDefault();
	if (await saveDialogNode()) await renderRoute();
});

window.addEventListener('hashchange', () => { void renderRoute(); });
window.addEventListener('resize', drawHubLinks);
window.addEventListener('storage', event => {
	if (isLocalDemo && event.key === 'hub.notes' && parseRoute().path === '/hub') void refreshHubView();
});

void renderRoute();