const statusMessage = document.querySelector('#status-message')
const progressBar = document.querySelector('#progress-bar')
const failureActions = document.querySelector('#failure-actions')
const crashActions = document.querySelector('#crash-actions')
const crashSuspect = document.querySelector('#crash-suspect')
const logDetails = document.querySelector('#log-details')
const logTail = document.querySelector('#log-tail')
const retryButton = document.querySelector('#retry-button')
const logsButton = document.querySelector('#logs-button')
const safeModeButton = document.querySelector('#safe-mode-button')
const disablePluginButton = document.querySelector('#disable-plugin-button')
const recoverButton = document.querySelector('#recover-button')
const stages = [...document.querySelectorAll('.rail-item')]

function setStage(index) {
  stages.forEach((stage, stageIndex) => {
    stage.classList.toggle('complete', stageIndex < index)
    stage.classList.toggle('active', stageIndex === index)
  })
  progressBar.style.width = `${[18, 56, 88][index] ?? 18}%`
}

function render(state) {
  statusMessage.textContent = state.message
  const isError = state.status === 'error'
  failureActions.hidden = !isError
  logDetails.hidden = !isError
  logTail.textContent = (state.logTail ?? []).slice(-30).join('\n')
  if (state.status === 'starting') setStage(/插件/.test(state.message) ? 2 : 1)
  if (state.status === 'ready') { setStage(2); progressBar.style.width = '100%' }
  if (isError) { progressBar.style.width = '100%'; progressBar.style.background = 'var(--danger)' }
}

function renderBootState(boot) {
  crashActions.hidden = !(boot && boot.crashLoop)
  if (!boot || !boot.crashLoop) return
  if (boot.suspectedPlugin) {
    crashSuspect.hidden = false
    crashSuspect.textContent = `疑似插件：${boot.suspectedPlugin}`
  } else {
    crashSuspect.hidden = true
  }
  recoverButton.hidden = !boot.lastGoodAt
}

function busy(button, task) {
  button.disabled = true
  return task.finally(() => { button.disabled = false })
}

retryButton.addEventListener('click', () => {
  busy(retryButton, window.dshDesktop.restartHarness())
})
logsButton.addEventListener('click', () => void window.dshDesktop.openLogs())
safeModeButton.addEventListener('click', () => {
  busy(safeModeButton, window.dshDesktop.startSafeMode())
})
disablePluginButton.addEventListener('click', () => {
  busy(disablePluginButton, window.dshDesktop.startWithPluginsDisabled())
})
recoverButton.addEventListener('click', () => {
  busy(recoverButton, window.dshDesktop.recoverLastGood())
})

void window.dshDesktop.getRuntimeState().then(render)
window.dshDesktop.onRuntimeState(render)
void window.dshDesktop.getBootState().then(renderBootState)
window.dshDesktop.onBootState(renderBootState)
