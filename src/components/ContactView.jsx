import React, { useEffect, useState } from 'react';
import { Icon } from './Icons';
import './css/ContactView.css';

// unsent contact form input is kept for the tab session so switching views
// or pages doesn't wipe it
const CONTACT_DRAFT_KEY = 'contactDraft';
const EMPTY_CONTACT_DRAFT = { username: '', email: '', concern: '' };

function ContactView() {
  const [formStatus, setFormStatus] = useState('');
  const [draft, setDraft] = useState(() => {
    try {
      return { ...EMPTY_CONTACT_DRAFT, ...JSON.parse(sessionStorage.getItem(CONTACT_DRAFT_KEY) || '{}') };
    } catch {
      return EMPTY_CONTACT_DRAFT;
    }
  });

  useEffect(() => {
    try {
      sessionStorage.setItem(CONTACT_DRAFT_KEY, JSON.stringify(draft));
    } catch (error) {
      console.warn('Failed to save contact draft to sessionStorage:', error);
    }
  }, [draft]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setDraft((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    setFormStatus('sending');
    setTimeout(() => {
      setFormStatus('success');
      setDraft(EMPTY_CONTACT_DRAFT);
    }, 1500);
  };

  return (
    <section className="mh-contact mh-contact-page" aria-labelledby="mh-contact-heading">
      {/* same page header as the home greeting and the results screen */}
      <h1 id="mh-contact-heading" className="mp-greeting mh-contact-greeting">
        <span>Contact us,</span>
        Let&apos;s talk.
      </h1>
      <p className="mh-contact-lede">
        Have questions? Our support team is here to help you navigate your skin health journey.
      </p>

      {/* tinted card behind the form, like the "Get to know Skinvue" card on
          the home view; on desktop it sits to the right of the heading */}
      <div className="mh-contact-card">
        {formStatus === 'success' ? (
          <div className="mh-contact-success" role="status">
            <h3>Message Sent!</h3>
            <p>
              Thank you for reaching out. Our team will review your concern and get back to you
              within 24-48 hours.
            </p>
            <button type="button" className="mh-contact-submit" onClick={() => setFormStatus('')}>
              Send Another
            </button>
          </div>
        ) : (
          <form className="mh-contact-form" onSubmit={handleSubmit}>
            <label className="mh-contact-field">
              <span className="mh-sr-only">Username</span>
              <Icon name="user" size={20} />
              <input type="text" name="username" autoComplete="username" required placeholder="Username" value={draft.username} onChange={handleChange} />
            </label>

            <label className="mh-contact-field">
              <span className="mh-sr-only">E-mail</span>
              <Icon name="at" size={20} />
              <input type="email" name="email" autoComplete="email" required placeholder="E-mail" value={draft.email} onChange={handleChange} />
            </label>

            <label className="mh-contact-field mh-contact-field--message">
              <span className="mh-sr-only">Message</span>
              <Icon name="contact" size={20} />
              <textarea name="concern" rows="4" required placeholder="Message" value={draft.concern} onChange={handleChange} />
            </label>

            <div className="mh-contact-actions">
              <button type="submit" className="mh-contact-submit" disabled={formStatus === 'sending'}>
                {formStatus === 'sending' ? (
                  'Sending...'
                ) : (
                  <>
                    Send Message
                    <Icon name="arrow-right" size={20} />
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}

export default ContactView;
