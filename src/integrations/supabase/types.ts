export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      account_invites: {
        Row: {
          account_id: string
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          token: string
        }
        Insert: {
          account_id: string
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          token?: string
        }
        Update: {
          account_id?: string
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_invites_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_invites_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts_public"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_audit_logs: {
        Row: {
          action: string
          actor_admin_id: string | null
          actor_user_id: string | null
          created_at: string
          id: string
          metadata: Json
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          actor_admin_id?: string | null
          actor_user_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          actor_admin_id?: string | null
          actor_user_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: []
      }
      admin_invites: {
        Row: {
          accepted_by: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          status: string
          token: string
          updated_at: string
        }
        Insert: {
          accepted_by?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          status?: string
          token?: string
          updated_at?: string
        }
        Update: {
          accepted_by?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          status?: string
          token?: string
          updated_at?: string
        }
        Relationships: []
      }
      admin_notification_reads: {
        Row: {
          admin_user_id: string
          cleared_at: string | null
          notification_id: string
          read_at: string
        }
        Insert: {
          admin_user_id: string
          cleared_at?: string | null
          notification_id: string
          read_at?: string
        }
        Update: {
          admin_user_id?: string
          cleared_at?: string | null
          notification_id?: string
          read_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_notification_reads_admin_user_id_fkey"
            columns: ["admin_user_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_notification_reads_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "admin_notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_notifications: {
        Row: {
          account_deletion_request_id: string | null
          account_id: string | null
          created_at: string
          created_by_admin_id: string | null
          id: string
          message: string
          metadata: Json
          support_request_id: string | null
          title: string
          type: string
        }
        Insert: {
          account_deletion_request_id?: string | null
          account_id?: string | null
          created_at?: string
          created_by_admin_id?: string | null
          id?: string
          message: string
          metadata?: Json
          support_request_id?: string | null
          title: string
          type: string
        }
        Update: {
          account_deletion_request_id?: string | null
          account_id?: string | null
          created_at?: string
          created_by_admin_id?: string | null
          id?: string
          message?: string
          metadata?: Json
          support_request_id?: string | null
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_notifications_account_deletion_request_id_fkey"
            columns: ["account_deletion_request_id"]
            isOneToOne: false
            referencedRelation: "account_deletion_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_notifications_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_notifications_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_notifications_created_by_admin_id_fkey"
            columns: ["created_by_admin_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_notifications_support_request_id_fkey"
            columns: ["support_request_id"]
            isOneToOne: false
            referencedRelation: "support_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_users: {
        Row: {
          account_id: string | null
          created_at: string
          email: string
          id: string
          invited_by: string | null
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          account_id?: string | null
          created_at?: string
          email: string
          id?: string
          invited_by?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          account_id?: string | null
          created_at?: string
          email?: string
          id?: string
          invited_by?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_requests_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      email_change_requests: {
        Row: {
          account_id: string
          confirmed_at: string | null
          created_at: string
          current_email: string
          expires_at: string
          id: string
          requested_by_admin_id: string | null
          requested_email: string
          status: string
          token_hash: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id: string
          confirmed_at?: string | null
          created_at?: string
          current_email: string
          expires_at: string
          id?: string
          requested_by_admin_id?: string | null
          requested_email: string
          status?: string
          token_hash: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string
          confirmed_at?: string | null
          created_at?: string
          current_email?: string
          expires_at?: string
          id?: string
          requested_by_admin_id?: string | null
          requested_email?: string
          status?: string
          token_hash?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_change_requests_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_change_requests_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_change_requests_requested_by_admin_id_fkey"
            columns: ["requested_by_admin_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      account_deletion_requests: {
        Row: {
          account_id: string
          account_name: string | null
          additional_feedback: string | null
          alert_email_error: string | null
          alert_email_sent: boolean
          billing_interval: string | null
          cancelable_until: string
          canceled_at: string | null
          canceled_by: string | null
          completed_at: string | null
          created_at: string
          id: string
          last_error: string | null
          plan_tier: string | null
          reason: string
          requested_at: string
          requester_email: string | null
          requester_full_name: string | null
          requester_role: string
          save_ticket_created_at: string | null
          save_ticket_id: string | null
          requester_user_id: string | null
          scheduled_delete_at: string
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_period_end: string | null
          updated_at: string
        }
        Insert: {
          account_id: string
          account_name?: string | null
          additional_feedback?: string | null
          alert_email_error?: string | null
          alert_email_sent?: boolean
          billing_interval?: string | null
          cancelable_until: string
          canceled_at?: string | null
          canceled_by?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          plan_tier?: string | null
          reason: string
          requested_at?: string
          requester_email?: string | null
          requester_full_name?: string | null
          requester_role?: string
          save_ticket_created_at?: string | null
          save_ticket_id?: string | null
          requester_user_id?: string | null
          scheduled_delete_at: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_period_end?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          account_name?: string | null
          additional_feedback?: string | null
          alert_email_error?: string | null
          alert_email_sent?: boolean
          billing_interval?: string | null
          cancelable_until?: string
          canceled_at?: string | null
          canceled_by?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          plan_tier?: string | null
          reason?: string
          requested_at?: string
          requester_email?: string | null
          requester_full_name?: string | null
          requester_role?: string
          save_ticket_created_at?: string | null
          save_ticket_id?: string | null
          requester_user_id?: string | null
          scheduled_delete_at?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_period_end?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      account_members: {
        Row: {
          accepted_at: string | null
          account_id: string
          created_at: string
          id: string
          invited_at: string | null
          invited_email: string | null
          role: Database["public"]["Enums"]["account_role"]
          user_id: string
        }
        Insert: {
          accepted_at?: string | null
          account_id: string
          created_at?: string
          id?: string
          invited_at?: string | null
          invited_email?: string | null
          role?: Database["public"]["Enums"]["account_role"]
          user_id: string
        }
        Update: {
          accepted_at?: string | null
          account_id?: string
          created_at?: string
          id?: string
          invited_at?: string | null
          invited_email?: string | null
          role?: Database["public"]["Enums"]["account_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_members_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_members_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts_public"
            referencedColumns: ["id"]
          },
        ]
      }
      accounts: {
        Row: {
          beta_day_10_email_sent_at: string | null
          beta_day_25_email_sent_at: string | null
          beta_day_30_email_sent_at: string | null
          beta_plan_tier: string
          beta_started_at: string | null
          beta_trial_ends_at: string | null
          billing_interval: string | null
          city: string | null
          created_at: string
          id: string
          is_beta_user: boolean
          max_additional_users: number | null
          name: string
          plan_tier: string | null
          state: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_period_end: string | null
          subscription_status: Database["public"]["Enums"]["subscription_status"]
          updated_at: string
        }
        Insert: {
          beta_day_10_email_sent_at?: string | null
          beta_day_25_email_sent_at?: string | null
          beta_day_30_email_sent_at?: string | null
          beta_plan_tier?: string
          beta_started_at?: string | null
          beta_trial_ends_at?: string | null
          billing_interval?: string | null
          city?: string | null
          created_at?: string
          id?: string
          is_beta_user?: boolean
          max_additional_users?: number | null
          name?: string
          plan_tier?: string | null
          state?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_period_end?: string | null
          subscription_status?: Database["public"]["Enums"]["subscription_status"]
          updated_at?: string
        }
        Update: {
          beta_day_10_email_sent_at?: string | null
          beta_day_25_email_sent_at?: string | null
          beta_day_30_email_sent_at?: string | null
          beta_plan_tier?: string
          beta_started_at?: string | null
          beta_trial_ends_at?: string | null
          billing_interval?: string | null
          city?: string | null
          created_at?: string
          id?: string
          is_beta_user?: boolean
          max_additional_users?: number | null
          name?: string
          plan_tier?: string | null
          state?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_period_end?: string | null
          subscription_status?: Database["public"]["Enums"]["subscription_status"]
          updated_at?: string
        }
        Relationships: []
      }
      campuses: {
        Row: {
          account_id: string
          created_at: string
          id: string
          is_primary: boolean
          name: string
          updated_at: string
        }
        Insert: {
          account_id: string
          created_at?: string
          id?: string
          is_primary?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          created_at?: string
          id?: string
          is_primary?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campuses_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campuses_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts_public"
            referencedColumns: ["id"]
          },
        ]
      }
      global_message_views: {
        Row: {
          account_id: string
          created_at: string
          dismissed_at: string
          id: string
          message_id: string
          user_id: string
          viewed_on: string
        }
        Insert: {
          account_id: string
          created_at?: string
          dismissed_at?: string
          id?: string
          message_id: string
          user_id: string
          viewed_on?: string
        }
        Update: {
          account_id?: string
          created_at?: string
          dismissed_at?: string
          id?: string
          message_id?: string
          user_id?: string
          viewed_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "global_message_views_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "global_message_views_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "global_message_views_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "global_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      global_messages: {
        Row: {
          audience_type: string
          body: string
          created_at: string
          created_by_admin_id: string | null
          cta_label: string | null
          cta_url: string | null
          ends_at: string | null
          id: string
          starts_at: string | null
          status: string
          target_account_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          audience_type?: string
          body: string
          created_at?: string
          created_by_admin_id?: string | null
          cta_label?: string | null
          cta_url?: string | null
          ends_at?: string | null
          id?: string
          starts_at?: string | null
          status?: string
          target_account_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          audience_type?: string
          body?: string
          created_at?: string
          created_by_admin_id?: string | null
          cta_label?: string | null
          cta_url?: string | null
          ends_at?: string | null
          id?: string
          starts_at?: string | null
          status?: string
          target_account_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "global_messages_created_by_admin_id_fkey"
            columns: ["created_by_admin_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "global_messages_target_account_id_fkey"
            columns: ["target_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "global_messages_target_account_id_fkey"
            columns: ["target_account_id"]
            isOneToOne: false
            referencedRelation: "accounts_public"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          church_role: string | null
          created_at: string
          default_translation: string | null
          email: string | null
          full_name: string | null
          id: string
          plan_tier: string | null
          preferred_dashboard_campus_id: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_status: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          church_role?: string | null
          created_at?: string
          default_translation?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          plan_tier?: string | null
          preferred_dashboard_campus_id?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          church_role?: string | null
          created_at?: string
          default_translation?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          plan_tier?: string | null
          preferred_dashboard_campus_id?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_preferred_dashboard_campus_id_fkey"
            columns: ["preferred_dashboard_campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
        ]
      }
      sermons: {
        Row: {
          account_id: string
          background_settings: Json | null
          campus_id: string | null
          created_at: string
          created_by_user_id: string
          former_campus_name: string | null
          font_settings: Json | null
          id: string
          presentation_date: string | null
          scripture_reference: string | null
          series: string | null
          slides: Json
          title: string
          updated_at: string
        }
        Insert: {
          account_id: string
          background_settings?: Json | null
          campus_id?: string | null
          created_at?: string
          created_by_user_id: string
          former_campus_name?: string | null
          font_settings?: Json | null
          id?: string
          presentation_date?: string | null
          scripture_reference?: string | null
          series?: string | null
          slides?: Json
          title: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          background_settings?: Json | null
          campus_id?: string | null
          created_at?: string
          created_by_user_id?: string
          former_campus_name?: string | null
          font_settings?: Json | null
          id?: string
          presentation_date?: string | null
          scripture_reference?: string | null
          series?: string | null
          slides?: Json
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sermons_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sermons_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sermons_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
        ]
      }
      support_requests: {
        Row: {
          account_id: string | null
          archived_until: string | null
          completed_at: string | null
          completed_by_admin_id: string | null
          created_at: string
          email: string
          email_contacted_at: string | null
          email_contacted_by_admin_id: string | null
          id: string
          message: string
          name: string
          notification_error: string | null
          notification_sent: boolean
          organization: string | null
          phone: string | null
          status: string
          subject: string
          submitted_from: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          account_id?: string | null
          archived_until?: string | null
          completed_at?: string | null
          completed_by_admin_id?: string | null
          created_at?: string
          email: string
          email_contacted_at?: string | null
          email_contacted_by_admin_id?: string | null
          id?: string
          message: string
          name: string
          notification_error?: string | null
          notification_sent?: boolean
          organization?: string | null
          phone?: string | null
          status?: string
          subject?: string
          submitted_from?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          account_id?: string | null
          archived_until?: string | null
          completed_at?: string | null
          completed_by_admin_id?: string | null
          created_at?: string
          email?: string
          email_contacted_at?: string | null
          email_contacted_by_admin_id?: string | null
          id?: string
          message?: string
          name?: string
          notification_error?: string | null
          notification_sent?: boolean
          organization?: string | null
          phone?: string | null
          status?: string
          subject?: string
          submitted_from?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_requests_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_requests_completed_by_admin_id_fkey"
            columns: ["completed_by_admin_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_requests_email_contacted_by_admin_id_fkey"
            columns: ["email_contacted_by_admin_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      training_guides: {
        Row: {
          content: Json | null
          created_at: string
          id: string
          title: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          content?: Json | null
          created_at?: string
          id?: string
          title?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          content?: Json | null
          created_at?: string
          id?: string
          title?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      accounts_public: {
        Row: {
          beta_plan_tier: string | null
          beta_started_at: string | null
          beta_trial_ends_at: string | null
          billing_interval: string | null
          city: string | null
          created_at: string | null
          id: string | null
          is_beta_user: boolean | null
          max_additional_users: number | null
          name: string | null
          plan_tier: string | null
          state: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_period_end: string | null
          subscription_status:
            | Database["public"]["Enums"]["subscription_status"]
            | null
          updated_at: string | null
        }
        Insert: {
          beta_plan_tier?: string | null
          beta_started_at?: string | null
          beta_trial_ends_at?: string | null
          billing_interval?: string | null
          city?: string | null
          created_at?: string | null
          id?: string | null
          is_beta_user?: boolean | null
          max_additional_users?: number | null
          name?: string | null
          plan_tier?: string | null
          state?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_period_end?: string | null
          subscription_status?:
            | Database["public"]["Enums"]["subscription_status"]
            | null
          updated_at?: string | null
        }
        Update: {
          beta_plan_tier?: string | null
          beta_started_at?: string | null
          beta_trial_ends_at?: string | null
          billing_interval?: string | null
          city?: string | null
          created_at?: string | null
          id?: string | null
          is_beta_user?: boolean | null
          max_additional_users?: number | null
          name?: string | null
          plan_tier?: string | null
          state?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_period_end?: string | null
          subscription_status?:
            | Database["public"]["Enums"]["subscription_status"]
            | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      create_campus: {
        Args: { _account_id: string; _name: string }
        Returns: {
          account_id: string
          created_at: string
          id: string
          is_primary: boolean
          name: string
          updated_at: string
        }
      }
      delete_campus: { Args: { _campus_id: string }; Returns: string }
      ensure_enterprise_main_campus_for_account: {
        Args: { _account_id: string }
        Returns: string
      }
      get_account_members_for_user: {
        Args: { _user_id: string }
        Returns: {
          accepted_at: string
          account_id: string
          created_at: string
          id: string
          invited_at: string
          role: string
          user_id: string
        }[]
      }
      get_invite_by_token: {
        Args: { _token: string }
        Returns: {
          account_id: string
          email: string
          expires_at: string
          id: string
        }[]
      }
      get_user_account_id: { Args: { _user_id: string }; Returns: string }
      is_account_member: {
        Args: { _account_id: string; _user_id: string }
        Returns: boolean
      }
      is_account_owner: {
        Args: { _account_id: string; _user_id: string }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      set_enterprise_account_default_translation: {
        Args: { _account_id: string; _translation: string }
        Returns: undefined
      }
      update_my_church_role: {
        Args: { _church_role: string | null }
        Returns: string | null
      }
      rename_campus: {
        Args: { _campus_id: string; _name: string }
        Returns: {
          account_id: string
          created_at: string
          id: string
          is_primary: boolean
          name: string
          updated_at: string
        }
      }
      set_primary_campus: {
        Args: { _campus_id: string }
        Returns: {
          account_id: string
          created_at: string
          id: string
          is_primary: boolean
          name: string
          updated_at: string
        }
      }
      users_share_account: {
        Args: { _user_id_1: string; _user_id_2: string }
        Returns: boolean
      }
    }
    Enums: {
      account_role: "owner" | "member"
      subscription_status:
        | "active"
        | "past_due"
        | "canceled"
        | "trialing"
        | "inactive"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      account_role: ["owner", "member"],
      subscription_status: [
        "active",
        "past_due",
        "canceled",
        "trialing",
        "inactive",
      ],
    },
  },
} as const
