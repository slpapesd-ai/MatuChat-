export type View = 'login' | 'register' | 'discover' | 'profile' | 'chat' | 'events' | 'search' | 'shop' | 'group_profile';

export interface UserData {
  id: string;
  userID: number;
  username: string;
  email: string;
  phone?: string;
  password?: string;
  profilePic?: string;
  coverPic?: string;
  bio?: string;
  is_owner?: boolean;
  is_affiliate_owner?: boolean;
  is_verified?: boolean;
  is_food_local?: boolean;
  is_matustar?: boolean;
  unread_count?: number;
  follower_count?: number;
  following_count?: number;
  posts_count?: number;
  reaction_count?: number;
  is_following?: boolean;
  is_admin?: boolean;
  is_banned?: boolean;
  blocked_users?: string[];
  pinned_users?: string[];
  created_at?: string;
}

export interface Group {
  id: string;
  name: string;
  description?: string;
  image_url?: string;
  owner_id: string;
  created_at: string;
  member_count?: number;
  is_member?: boolean;
  created_by?: string;
  members?: string[];
  type?: string;
}

export interface Message {
  id: string;
  chat_id: string;
  sender_id: string;
  receiver_id?: string;
  group_id?: string;
  content: string;
  media_url?: string;
  media_type?: 'image' | 'video' | 'audio';
  created_at: string;
  username?: string;
  profilePic?: string;
  shared_post_id?: string;
  shared_product_id?: string;
  is_group?: boolean;
  is_read?: boolean;
}

export interface Chat {
  id: string;
  type: 'direct' | 'group';
  name?: string;
  image_url?: string;
  last_message?: string;
  last_message_time?: string;
  unread_count?: number;
  other_user_id?: string;
  other_username?: string;
  other_profile_pic?: string;
  streak_count?: number;
  last_streak_date?: string;
  is_group?: boolean;
  is_owner?: boolean;
  is_verified?: boolean;
  is_food_local?: boolean;
  is_matustar?: boolean;
}

export interface Event {
  id: string;
  title: string;
  description: string;
  date: string;
  location: string;
  media_url?: string;
  media_type?: 'image' | 'video';
  organizer_id: string;
  creator_username?: string;
  attendees?: string[];
  attendee_count?: number;
  is_attending?: boolean;
  group_id?: string;
  created_at: string;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  image_url?: string;
  seller_id: string;
  seller_username?: string;
  created_at: string;
}
