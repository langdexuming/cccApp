import axios from 'axios'

export const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
})

function unwrapError(error) {
  if (error?.response?.data?.detail) {
    const detail = String(error.response.data.detail)
    const translated = {
      'Run not found.': '未找到运行记录。',
      'Experiment not found.': '未找到训练。',
    }
    return new Error(translated[detail] || detail)
  }
  return new Error(error?.message || '请求失败。')
}

async function request(promise) {
  try {
    const { data } = await promise
    return data
  } catch (error) {
    throw unwrapError(error)
  }
}

export function fetchHealth() {
  return request(api.get('/health'))
}

export function fetchExperiments() {
  return request(api.get('/experiments'))
}

export function fetchExperiment(experimentId) {
  return request(api.get(`/experiments/${experimentId}`))
}

export function createExperiment(payload) {
  return request(api.post('/experiments', payload))
}

export function createRun(experimentId) {
  return request(api.post(`/experiments/${experimentId}/runs`))
}

export function fetchRuns() {
  return request(api.get('/runs'))
}

export function fetchRun(runId) {
  return request(api.get(`/runs/${runId}`))
}
