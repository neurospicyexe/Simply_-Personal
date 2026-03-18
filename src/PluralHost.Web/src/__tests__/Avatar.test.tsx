import { render, screen } from '@testing-library/react'
import Avatar from '../components/Avatar'

test('shows first initial when no avatarPath', () => {
  render(<Avatar name="Cypress" color="#b6ff00" />)
  expect(screen.getByText('C')).toBeInTheDocument()
})

test('shows img when avatarPath is provided', () => {
  render(<Avatar name="Cypress" color="#b6ff00" avatarPath="/api/media/abc" />)
  expect(screen.getByRole('img', { name: 'Cypress' })).toBeInTheDocument()
})

test('applies member color as CSS var when no image', () => {
  const { container } = render(<Avatar name="Kai" color="#ff4db8" />)
  const circle = container.firstChild as HTMLElement
  expect(circle).toHaveStyle({ '--member-color': '#ff4db8' })
})

test('applies fronting ring class when isFronting is true', () => {
  const { container } = render(<Avatar name="Kai" color="#b6ff00" isFronting />)
  const element = container.firstChild as HTMLElement
  expect(element.className).toMatch(/fronting/)
})
