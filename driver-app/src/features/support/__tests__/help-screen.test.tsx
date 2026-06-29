import { Linking } from 'react-native';

import { fireEvent, render, screen } from '@/shared/testing/render';

import { HelpScreen } from '../ui/help-screen';

describe('<HelpScreen />', () => {
  it('renders the FAQ and contact actions, and opens email on tap', () => {
    const spy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never);

    render(<HelpScreen />);

    expect(screen.getByText('Aide & support')).toBeOnTheScreen();
    expect(screen.getByTestId('help-faq-0')).toBeOnTheScreen();

    fireEvent.press(screen.getByTestId('help-email'));
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('mailto:'));

    spy.mockRestore();
  });

  it('opens WhatsApp on tap', () => {
    const spy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never);

    render(<HelpScreen />);
    fireEvent.press(screen.getByTestId('help-whatsapp'));

    expect(spy).toHaveBeenCalledWith(expect.stringContaining('wa.me/'));
    spy.mockRestore();
  });
});
