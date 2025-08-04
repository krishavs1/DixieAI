import { CarPlay, GridTemplate, ListTemplate, AlertTemplate } from 'react-native-carplay';

interface EmailSummary {
  subject: string;
  from: string;
  snippet: string;
  date: string;
}

class CarPlayService {
  private isInitialized = false;
  private emailSummaries: EmailSummary[] = [];
  private currentStatus = 'Ready';

  initialize() {
    if (this.isInitialized) return;
    
    try {
      // Register for CarPlay connection
      CarPlay.registerOnConnect(() => {
        console.log('CarPlay connected - setting up interface');
        this.setupCarPlayInterface();
      });

      console.log('CarPlay service ready (will activate when connected)');
      this.isInitialized = true;
    } catch (error) {
      console.error('CarPlay service initialization failed:', error);
      // Don't crash the app, just log the error
    }
  }

  private setupCarPlayInterface() {
    try {
      // Create the main grid template
      const mainTemplate = new GridTemplate({
        title: 'DixieAI Email',
        buttons: [
          {
            id: 'inbox',
            titleVariants: ['Inbox Summary'],
            image: '📧',
          },
          {
            id: 'voice',
            titleVariants: ['Voice Commands'],
            image: '🎤',
          },
          {
            id: 'status',
            titleVariants: ['Status'],
            image: '✅',
          },
        ],
        onButtonPressed: (event) => {
          console.log('CarPlay button pressed:', event);
          this.handleButtonPress(event);
        },
      });

      // Set as root template
      CarPlay.setRootTemplate(mainTemplate);
      console.log('CarPlay interface setup complete');
    } catch (error) {
      console.error('Error setting up CarPlay interface:', error);
    }
  }

  private async handleButtonPress(event: any) {
    switch (event.id) {
      case 'inbox':
        await this.showInboxSummary();
        break;
        
      case 'voice':
        this.showVoiceCommands();
        break;
        
      case 'status':
        this.showStatus();
        break;
    }
  }

  private async showInboxSummary() {
    try {
      // Create email list items
      const emailItems = this.emailSummaries.slice(0, 10).map((email, index) => ({
        text: email.subject || 'No Subject',
        detailText: `From: ${email.from} • ${email.date}`,
      }));

      if (emailItems.length === 0) {
        emailItems.push({
          text: 'No emails found',
          detailText: 'Your inbox is empty',
        });
      }

      const inboxTemplate = new ListTemplate({
        title: 'Recent Emails',
        sections: [
          {
            header: 'Inbox',
            items: emailItems,
          },
        ],
        onItemSelect: (event) => {
          console.log('Email selected:', event);
          // Could show email details here
        },
      });

      CarPlay.pushTemplate(inboxTemplate);
    } catch (error) {
      console.error('Error showing inbox summary:', error);
    }
  }

  private showVoiceCommands() {
    try {
      const voiceTemplate = new AlertTemplate({
        titleVariants: ['Voice Commands'],
        actions: [
          {
            id: 'ok',
            title: 'OK',
          },
        ],
      });

      CarPlay.presentTemplate(voiceTemplate);
    } catch (error) {
      console.error('Error showing voice commands:', error);
    }
  }

  private showStatus() {
    try {
      const statusTemplate = new AlertTemplate({
        titleVariants: ['DixieAI Status'],
        actions: [
          {
            id: 'ok',
            title: 'OK',
          },
        ],
      });

      CarPlay.presentTemplate(statusTemplate);
    } catch (error) {
      console.error('Error showing status:', error);
    }
  }

  // Method to update CarPlay when voice commands are processed
  updateFromVoiceCommand(command: string, response?: string) {
    try {
      const alertTemplate = new AlertTemplate({
        titleVariants: ['Voice Command'],
        actions: [
          {
            id: 'ok',
            title: 'OK',
          },
        ],
      });

      CarPlay.presentTemplate(alertTemplate);
      console.log('CarPlay: Voice command update:', command, response);
    } catch (error) {
      console.error('Error updating CarPlay from voice command:', error);
    }
  }

  // Method to show email summary on CarPlay
  showEmailSummary(summary: string) {
    try {
      const summaryTemplate = new ListTemplate({
        title: 'Email Summary',
        sections: [
          {
            header: 'Inbox Summary',
            items: [
              {
                text: 'Summary',
                detailText: summary.substring(0, 100) + '...',
              },
            ],
          },
        ],
        onItemSelect: () => {
          CarPlay.popTemplate();
        },
      });

      CarPlay.pushTemplate(summaryTemplate);
    } catch (error) {
      console.error('Error showing email summary on CarPlay:', error);
    }
  }

  // Method to show when voice is listening
  showListeningState() {
    try {
      const listeningTemplate = new AlertTemplate({
        titleVariants: ['Listening...'],
        actions: [
          {
            id: 'cancel',
            title: 'Cancel',
            style: 'destructive',
          },
        ],
      });

      CarPlay.presentTemplate(listeningTemplate);
    } catch (error) {
      console.error('Error showing listening state on CarPlay:', error);
    }
  }

  // Method to update email summaries
  updateEmailSummaries(emails: EmailSummary[]) {
    this.emailSummaries = emails;
    console.log('CarPlay: Updated email summaries');
  }

  // Method to update status
  updateStatus(status: string) {
    this.currentStatus = status;
    console.log('CarPlay: Updated status to', status);
  }
}

export const carPlayService = new CarPlayService();
export default carPlayService; 