import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Assistant } from '../components/Assistant';
import * as assistantService from '../services/assistantService';

// Mock the service
vi.mock('../services/assistantService', () => ({
  generateAssistantResponse: vi.fn(),
}));

// Mock brandConfig
vi.mock('../config', () => ({
  brandConfig: {
    companyName: 'Healthco',
    colors: {
      primary: '#0077C8',
      secondary: '#005a9e',
      accent: '#0077C8',
    },
  },
}));

describe('Assistant Interaction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the initial message and handle button clicks', async () => {
    const mockResponse = { html: '<div>Mock AI Response</div>' };
    (assistantService.generateAssistantResponse as any).mockResolvedValue(mockResponse);

    render(<Assistant />);
    expect(screen.getByText(/Hello! I am your Healthco Assistant/i)).toBeInTheDocument();
    
    const findProviderBtn = screen.getByText(/Find a Provider/i).closest('button');
    expect(findProviderBtn).toBeInTheDocument();
    
    if (findProviderBtn) {
      fireEvent.click(findProviderBtn);
    }

    await waitFor(() => {
      expect(screen.getByText(/Help me find a doctor or specialist in my network/i)).toBeInTheDocument();
    });
  });

  it('handles any attribute with data-action', async () => {
    const mockAIResponse = { 
      html: `
        <div>
          <button data-action="suggested-prompt" data-prompt="Test Button Message" class="test-btn">Click Me Button</button>
          <span data-action="suggested-prompt" data-prompt="Test Span Message" class="lookup-trigger">Click Me Span</span>
        </div>
      ` 
    };
    
    (assistantService.generateAssistantResponse as any).mockResolvedValue(mockAIResponse);

    render(<Assistant />);
    
    // Send a message to get the AI response
    const input = screen.getByPlaceholderText(/Ask about/i);
    const sendBtn = screen.getByLabelText(/Send Message/i);
    
    fireEvent.change(input, { target: { value: 'Hi' } });
    fireEvent.click(sendBtn);

    // Click the button
    const aiBtn = await screen.findByText(/Click Me Button/i);
    fireEvent.click(aiBtn);
    
    await waitFor(() => {
      expect(screen.getByText(/Test Button Message/i)).toBeInTheDocument();
    });

    // Click the span
    const aiSpan = await screen.findByText(/Click Me Span/i);
    fireEvent.click(aiSpan);

    await waitFor(() => {
      expect(screen.getByText(/Test Span Message/i)).toBeInTheDocument();
    });
  });
});
