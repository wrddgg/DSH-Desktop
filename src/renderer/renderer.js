const statusMessage = document.querySelector('#status-message')
const progressBar = document.querySelector('#progress-bar')
const failureActions = document.querySelector('#failure-actions')
const logDetails = document.querySelector('#log-details')
const logTail = document.querySelector('#log-tail')
const retryButton = document.querySelector('#retry-button')
const logsButton = document.querySelector('#logs-button')
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

retryButton.addEventListener('click', () => {
  retryButton.disabled = true
  void window.dshDesktop.restartHarness().finally(() => { retryButton.disabled = false })
})
logsButton.addEventListener('click', () => void window.dshDesktop.openLogs())
void window.dshDesktop.getRuntimeState().then(render)
window.dshDesktop.onRuntimeState(render)
