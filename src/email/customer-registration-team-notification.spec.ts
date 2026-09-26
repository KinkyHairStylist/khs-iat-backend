import { EmailService } from './email.service';
import { TemplateService } from './template.service';

const build = (teamEmail?: string) => {
  const config = {
    get: (key: string) =>
      ({
        SENDGRID_API_KEY: 'SG.test',
        DELIVERY_TEAM_EMAIL: teamEmail,
        FRONTEND_URL: 'https://example.test',
      })[key],
  };
  const templates = { render: jest.fn().mockReturnValue('<p>rendered</p>') };
  const service = new EmailService(config as any, templates as any);
  const sendEmail = jest
    .spyOn(service, 'sendEmail')
    .mockReturnValue({ success: true });
  return { service, templates, sendEmail };
};

describe('EmailService.sendCustomerRegistrationTeamNotification', () => {
  it('emails the KHS team mailbox about the new customer', () => {
    const { service, templates, sendEmail } = build('team@example.test');

    service.sendCustomerRegistrationTeamNotification(
      'Ada',
      'ada@example.test',
      'user-1',
    );

    expect(templates.render).toHaveBeenCalledWith(
      'customer-team-notification',
      expect.objectContaining({
        customerName: 'Ada',
        email: 'ada@example.test',
        customerId: 'user-1',
      }),
    );
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const [to, subject, text] = sendEmail.mock.calls[0];
    expect(to).toBe('team@example.test');
    expect(subject).toContain('Ada');
    expect(text).toContain('ada@example.test');
  });

  it('renders the real template with the customer details, escaping markup in the name', () => {
    const html = new TemplateService().render('customer-team-notification', {
      customerName: '<b>Ada</b>',
      customerId: 'user-1',
      email: 'ada@example.test',
      frontendUrl: 'https://example.test',
      year: 2026,
    });

    expect(html).toContain('ada@example.test');
    expect(html).toContain('user-1');
    expect(html).toContain('&lt;b&gt;Ada&lt;/b&gt;');
    expect(html).not.toContain('<b>Ada</b>');
  });

  it('sends nothing when DELIVERY_TEAM_EMAIL is not set', () => {
    const { service, sendEmail } = build(undefined);

    service.sendCustomerRegistrationTeamNotification(
      'Ada',
      'ada@example.test',
      'user-1',
    );

    expect(sendEmail).not.toHaveBeenCalled();
  });
});
