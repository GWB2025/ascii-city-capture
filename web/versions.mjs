/* Saved releases and explicit switching; the running iframe has its own ID. */
export class CityVersions {
  constructor({onSelect, onOpen = () => {}, request = (...args) => globalThis.fetch(...args), document = globalThis.document}) {
    this.onSelect = onSelect;
    this.request = request;
    this.document = document;
    this.element = id => document.getElementById(id);
    this.dialog = this.element('versions-dialog');
    this.active = null;
    this.busy = false;
    this.element('versions').addEventListener('click', () => { onOpen(); this.open(); });
    this.element('close-versions').addEventListener('click', () => this.dialog.close());
    this.element('add-version').addEventListener('submit', event => {
      event.preventDefault(); this.check(this.element('city-url').value);
    });
  }
  async api(path, body) {
    const response = await this.request(path, body === undefined ? {} : {
      method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)
    });
    const result = await response.json();
    if (!response.ok) throw Error(result.error || 'The city request could not be completed.');
    return result;
  }
  status(text, error = false) {
    const element = this.element('version-status');
    element.textContent = text;
    element.classList.toggle('error', error);
  }
  async initialise() {
    const catalog = await this.api('/api/cities');
    const entry = catalog.versions.find(item => item.id === catalog.selected);
    if (!entry) throw Error('Your selected city is missing. Open City versions to choose another.');
    this.active = entry.id;
    this.onSelect(entry);
    this.render(catalog);
  }
  async open() {
    this.dialog.showModal();
    try { this.render(await this.api('/api/cities')); }
    catch (error) { this.status(error.message, true); }
  }
  render(catalog) {
    const list = this.element('version-list');
    list.replaceChildren();
    for (const entry of catalog.versions) {
      const card = this.document.createElement('article');
      card.className = 'version-card';
      const description = this.document.createElement('div');
      const title = this.document.createElement('h3');
      title.textContent = entry.name.replace(/^ASCII City /, '');
      const detail = this.document.createElement('p');
      detail.textContent = entry.version + ' · ' + (entry.support === 'verified' ? 'Capture tested' : entry.support === 'detected' ? 'Capture detected · check your first preview' : 'Needs a capture update');
      const source = this.document.createElement('a');
      source.href = entry.source; source.target = '_blank'; source.rel = 'noopener noreferrer';
      source.textContent = new URL(entry.source).hostname;
      description.append(title, detail, source);
      const action = this.document.createElement('button');
      action.type = 'button'; action.className = 'quiet';
      action.dataset.cityId = entry.id;
      action.textContent = entry.id === this.active ? 'In use' : entry.support === 'unsupported' ? 'Unavailable' : 'Use this version';
      action.disabled = entry.id === this.active || entry.support === 'unsupported' || this.busy;
      action.addEventListener('click', () => this.select(entry.id));
      card.append(description, action); list.append(card);
    }
  }
  async select(id) {
    if (this.busy || id === this.active) return;
    this.busy = true;
    this.setBusy();
    this.status('Opening the selected city…');
    try {
      const entry = await this.api('/api/cities/select', {id});
      this.onSelect(entry);
      this.active = entry.id;
      this.status('');
      this.dialog.close();
    } catch (error) { this.status(error.message, true); }
    finally {
      this.busy = false; this.setBusy();
      try { this.render(await this.api('/api/cities')); } catch { /* Keep existing cards. */ }
    }
  }
  setBusy() {
    this.element('check-city').disabled = this.busy;
    for (const button of this.element('version-list').querySelectorAll('button')) button.disabled = true;
  }
  async check(url) {
    if (this.busy) return;
    this.busy = true; this.setBusy();
    this.status('Checking the city link…');
    try {
      let job = await this.api('/api/cities/check', {url});
      while (job.status === 'checking') {
        this.status(job.message);
        await new Promise(resolve => setTimeout(resolve, 650));
        job = await this.api('/api/cities/jobs/' + encodeURIComponent(job.id));
      }
      if (job.status === 'error') throw Error(job.message);
      this.status(job.entry.support === 'unsupported'
        ? 'This build needs updated capture support. Your current city is still available.'
        : 'This version is saved below. Choose “Use this version” to open it.', job.entry.support === 'unsupported');
    } catch (error) { this.status(error.message, true); }
    finally {
      this.busy = false; this.setBusy();
      try { this.render(await this.api('/api/cities')); }
      catch (error) { this.status(error.message, true); }
    }
  }
}

export class CitySession {
  constructor(iframe, origin = location.origin) { this.iframe = iframe; this.origin = origin; this.token = null; }
  mount(id) {
    this.token = crypto.randomUUID();
    this.iframe.src = '/city/' + encodeURIComponent(id) + '/?capture-session=' + this.token;
  }
  accepts(event) {
    return !!this.token && event.origin === this.origin && event.source === this.iframe.contentWindow
      && event.data?.cityCapture === true && event.data.session === this.token;
  }
  send(type) { this.iframe.contentWindow.postMessage({cityCapture: true, type, session: this.token}, this.origin); }
}
